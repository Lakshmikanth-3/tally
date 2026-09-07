import { cre, hexToBase64, ok, text, type TeeRuntime } from '@chainlink/cre-sdk'
import { classifyDecline, computeDiscountRate, UnderwritingReasonCode } from './pricing'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { z } from 'zod'

// ─── Config Schema ──────────────────────────────────────────
export const configSchema = z.object({
	schedule: z.string(),
	consoleBaseUrl: z.string(),
	issuerId: z.string(),
	secretId: z.string(),
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

	donRuntime
		.report({
			encodedPayload: hexToBase64(encodedPayload),
			encoderName: 'evm',
			signingAlgo: 'ecdsa',
			hashingAlgo: 'keccak256',
		})
		.result()

	return `${approved ? 'APPROVED' : 'DECLINED'} (bps=${recommendedCouponBps}, reason=${reasonCode})`
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
