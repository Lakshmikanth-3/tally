import { bytesToHex, cre, getNetwork, hexToBase64, ok, text, TxStatus, type TeeRuntime } from '@chainlink/cre-sdk'
import { classifyDecline, computeDiscountRate, UnderwritingReasonCode } from './pricing'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { z } from 'zod'

// ─── Config Schema ──────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),
	consoleBaseUrl: z.string(),
	issuerId: z.string(),
	secretId: z.string(),
	// Where the verdict is written on-chain: Tally's UnderwritingRegistry
	// (contracts/src/UnderwritingRegistry.sol), reached through the chain's
	// Keystone forwarder.
	evm: z.object({
		chainName: z.string(),
		registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
		gasLimit: z.string(),
	}),
})
type Config = z.infer<typeof configSchema>

interface RevenueApiResponse {
	issuerId: string
	trailing90dTotalUSD: string
	volatilityScore: number
	historyDays: number
}

// ─── TEE Cron Callback ──────────────────────────────────────
// Receives a `TeeRuntime`, not a `Runtime`. Everything here runs inside the
// enclave until we explicitly cross back with `usingTheDons()`.
export const onUnderwritingTrigger = (runtime: TeeRuntime<Config>): string => {
	const config = runtime.config

	// ── Fetch the bearer secret inside the enclave ──
	// Released by the Vault DON only into this attested enclave, decrypted at
	// the moment getSecret() runs — never in plaintext to node operators.
	const apiToken = runtime.getSecret({ id: config.secretId }).result().value

	// ── Fetch a real business's actual submitted revenue, from inside the enclave ──
	// This is Tally's own console API (apps/console), never a fixture. The
	// request and response payload stay confidential from node operators
	// because HTTPClient.sendRequest has a TeeRuntime overload.
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: `${config.consoleBaseUrl}/api/business/${config.issuerId}/revenue`,
			method: 'GET',
			multiHeaders: {
				Authorization: { values: [`Bearer ${apiToken}`] },
			},
		})
		.result()

	if (!ok(response)) {
		throw new Error(`Revenue fetch failed with status: ${response.statusCode}`)
	}

	const snapshot = JSON.parse(text(response)) as RevenueApiResponse
	const revenue = {
		issuerId: snapshot.issuerId,
		trailing90dTotalUSD: BigInt(snapshot.trailing90dTotalUSD),
		volatilityScore: snapshot.volatilityScore,
		historyDays: snapshot.historyDays,
	}

	// ── The underwriting policy itself — this is the logic that stays
	// confidential from node operators, applied over the confidential
	// revenue figures fetched above ──
	const reasonCode = classifyDecline(revenue)
	const approved = reasonCode === UnderwritingReasonCode.APPROVED
	const recommendedCouponBps = computeDiscountRate(revenue)

	// Log only the verdict, never the raw revenue figures — those must not
	// leak back out through logs even in simulation.
	runtime.log(`Underwriting complete for ${revenue.issuerId}: approved=${approved} bps=${recommendedCouponBps} reason=${reasonCode}`)

	// ── Cross back to the DON for consensus — only the verdict crosses,
	// never the trailing revenue total or volatility score ──
	const donRuntime = runtime.usingTheDons()

	const encodedPayload = encodeAbiParameters(
		parseAbiParameters('string issuerId, bool approved, uint256 recommendedCouponBps, uint8 reasonCode'),
		[revenue.issuerId, approved, BigInt(recommendedCouponBps), reasonCode],
	)

	const report = donRuntime
		.report({
			encodedPayload: hexToBase64(encodedPayload),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	// ── Deliver the signed verdict on-chain. Chain writes always run on the
	// Workflow DON, which is why this happens after usingTheDons(): the
	// report carries only the verdict, so nothing confidential is exposed ──
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.evm.chainName, isTestnet: true })
	if (!network) {
		throw new Error(`Unknown chain: ${config.evm.chainName}`)
	}

	const write = new cre.capabilities.EVMClient(network.chainSelector.selector)
		.writeReport(donRuntime, {
			receiver: config.evm.registryAddress,
			report,
			gasConfig: { gasLimit: config.evm.gasLimit },
		})
		.result()

	if (write.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Verdict write failed: ${write.errorMessage || write.txStatus}`)
	}
	// The forwarder tx can succeed while the receiver's onReport does not: it
	// can revert, or run out of the gas the forwarder passes on. Either way the
	// forwarder's own tx is mined with status 1 and the verdict is simply never
	// stored, so the tx receipt alone does not prove the write landed.
	// RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS = 0, REVERTED = 1, and the
	// field is optional, so anything that is not an explicit SUCCESS is treated
	// as a failure rather than assumed good.
	if (write.receiverContractExecutionStatus !== 0) {
		throw new Error(
			`Verdict not stored by UnderwritingRegistry.onReport ` +
				`(receiverContractExecutionStatus=${write.receiverContractExecutionStatus})`,
		)
	}

	const txHash = bytesToHex(write.txHash ?? new Uint8Array(32))
	runtime.log(`Verdict written to UnderwritingRegistry ${config.evm.registryAddress}: tx=${txHash}`)

	return `${approved ? 'APPROVED' : 'DECLINED'} (bps=${recommendedCouponBps}, reason=${reasonCode}) tx=${txHash}`
}

// ─── Workflow Init ──────────────────────────────────────────
export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		// `cre.handlerInTee` instead of `cre.handler` — the callback runs
		// inside the enclave. AWS Nitro in us-west-2 is currently the only
		// registered TEE type/region.
		cre.handlerInTee(cronTrigger.trigger({ schedule: config.schedule }), onUnderwritingTrigger, [
			{ tee: 'nitro', regions: ['us-west-2'] },
		]),
	]
}
