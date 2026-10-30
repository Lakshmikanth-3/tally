import { describe, expect } from 'bun:test'
import { TxStatus, type TeeRuntime } from '@chainlink/cre-sdk'
import { test } from '@chainlink/cre-sdk/test'
import { decodeAbiParameters, parseAbiParameters } from 'viem'
import { initWorkflow, onUnderwritingTrigger } from './workflow'

const API_TOKEN = 'test-token'
const REGISTRY = '0x1111111111111111111111111111111111111111'
const SEPOLIA_SELECTOR = 16015286601757825753n

const makeConfig = () => ({
	schedule: '0 */1 * * * *',
	consoleBaseUrl: 'http://localhost:3000',
	issuerId: 'issuer-test',
	secretId: 'REVENUE_API_TOKEN',
	evm: { chainName: 'ethereum-testnet-sepolia', registryAddress: REGISTRY, gasLimit: '500000' },
})

// An approvable snapshot: >= 30 days history, >= $3,000 (6-dp fixed point), volatility <= 40.
const APPROVABLE = {
	issuerId: 'issuer-test',
	trailing90dTotalUSD: '12345678900',
	volatilityScore: 17,
	historyDays: 95,
}

type FakeOptions = {
	statusCode?: number
	snapshot?: object
	txStatus?: TxStatus
	// RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS = 0, REVERTED = 1. The field is
	// optional in the protobuf, so `null` here stands for "the node reported no
	// status at all" — which the handler must not read as success.
	receiverStatus?: number | null
}

// The public test surface does not ship a TEE runtime factory, so we stand up
// the slice of TeeRuntime / Runtime the handler uses: config, getSecret,
// callCapability (HTTPClient and EVMClient both go through it), log,
// usingTheDons and report.
const makeFakeTeeRuntime = ({
	statusCode = 200,
	snapshot = APPROVABLE,
	txStatus = TxStatus.SUCCESS,
	receiverStatus = 0,
}: FakeOptions = {}) => {
	const capturedHeaders: string[] = []
	const reports: { encodedPayload: string }[] = []
	const writes: { capabilityId: string; payload: { receiver: Uint8Array; gasConfig?: { gasLimit: bigint } } }[] = []
	const logs: string[] = []

	const donRuntime = {
		report: (input: { encodedPayload: string }) => {
			reports.push(input)
			return { result: () => ({ x_generatedCodeOnly_unwrap: () => undefined }) }
		},
		callCapability: (call: (typeof writes)[number]) => {
			writes.push(call)
			return {
				result: () => ({
					txStatus,
					receiverContractExecutionStatus: receiverStatus ?? undefined,
					txHash: new Uint8Array(32).fill(0xab),
				}),
			}
		},
		log: (message: string) => logs.push(message),
	}

	const runtime = {
		config: makeConfig(),
		getSecret: (request: { id?: string }) => ({
			result: () => ({ id: request.id, value: API_TOKEN }),
		}),
		callCapability: ({ payload }: { payload: { multiHeaders?: Record<string, unknown> } }) => {
			const auth = payload.multiHeaders?.Authorization as { values?: string[] } | undefined
			capturedHeaders.push(...(auth?.values ?? []))
			return {
				result: () => ({
					statusCode,
					body: new TextEncoder().encode(JSON.stringify(snapshot)),
				}),
			}
		},
		log: (message: string) => logs.push(message),
		usingTheDons: () => donRuntime,
	}

	return {
		runtime: runtime as unknown as TeeRuntime<ReturnType<typeof makeConfig>>,
		capturedHeaders,
		reports,
		writes,
		logs,
	}
}

const decodeReport = (b64: string) =>
	decodeAbiParameters(
		parseAbiParameters('string issuerId, bool approved, uint256 recommendedCouponBps, uint8 reasonCode'),
		`0x${Buffer.from(b64, 'base64').toString('hex')}`,
	)

describe('onUnderwritingTrigger', () => {
	test('injects the enclave-fetched secret into the revenue request', () => {
		const { runtime, capturedHeaders } = makeFakeTeeRuntime()
		onUnderwritingTrigger(runtime)
		expect(capturedHeaders).toEqual([`Bearer ${API_TOKEN}`])
	})

	test('approves a qualifying business and encodes only the verdict', () => {
		const { runtime, reports } = makeFakeTeeRuntime()
		expect(onUnderwritingTrigger(runtime)).toStartWith('APPROVED (bps=428, reason=0)')

		expect(reports).toHaveLength(1)
		const [issuerId, approved, bps, reason] = decodeReport(reports[0].encodedPayload)
		expect(issuerId).toBe('issuer-test')
		expect(approved).toBe(true)
		expect(bps).toBe(428n)
		expect(reason).toBe(0)
	})

	test('declines with INSUFFICIENT_HISTORY for a new business', () => {
		const { runtime, reports } = makeFakeTeeRuntime({ snapshot: { ...APPROVABLE, historyDays: 5 } })
		expect(onUnderwritingTrigger(runtime)).toStartWith('DECLINED')
		const [, approved, , reason] = decodeReport(reports[0].encodedPayload)
		expect(approved).toBe(false)
		expect(reason).toBe(2)
	})

	test('writes the signed report to the UnderwritingRegistry on Sepolia', () => {
		const { runtime, writes } = makeFakeTeeRuntime()
		const result = onUnderwritingTrigger(runtime)

		expect(writes).toHaveLength(1)
		expect(writes[0].capabilityId).toContain(`ChainSelector:${SEPOLIA_SELECTOR}`)
		expect(Buffer.from(writes[0].payload.receiver).toString('hex')).toBe(REGISTRY.slice(2))
		expect(writes[0].payload.gasConfig?.gasLimit).toBe(500000n)
		expect(result).toContain(`tx=0x${'ab'.repeat(32)}`)
	})

	test('throws when the write transaction fails', () => {
		const { runtime } = makeFakeTeeRuntime({ txStatus: TxStatus.REVERTED })
		expect(() => onUnderwritingTrigger(runtime)).toThrow('Verdict write failed')
	})

	test('throws when the registry onReport reverts', () => {
		const { runtime } = makeFakeTeeRuntime({ receiverStatus: 1 })
		expect(() => onUnderwritingTrigger(runtime)).toThrow('Verdict not stored by UnderwritingRegistry')
	})

	// Regression: a real --broadcast run mined the forwarder tx with status 1
	// while onReport ran out of the gas the forwarder passed on, so the verdict
	// was never stored. Only an explicit SUCCESS counts as a stored verdict.
	test('throws when no receiver execution status is reported at all', () => {
		const { runtime } = makeFakeTeeRuntime({ receiverStatus: null })
		expect(() => onUnderwritingTrigger(runtime)).toThrow('Verdict not stored by UnderwritingRegistry')
	})

	test('throws on a non-2xx revenue response and never reaches the DON', () => {
		const { runtime, reports, writes } = makeFakeTeeRuntime({ statusCode: 401 })
		expect(() => onUnderwritingTrigger(runtime)).toThrow('status: 401')
		expect(reports).toHaveLength(0)
		expect(writes).toHaveLength(0)
	})

	test('never logs the secret or the raw revenue figures', () => {
		const { runtime, logs } = makeFakeTeeRuntime()
		onUnderwritingTrigger(runtime)
		for (const line of logs) {
			expect(line).not.toContain(API_TOKEN)
			expect(line).not.toContain(APPROVABLE.trailing90dTotalUSD)
			expect(line).not.toContain('volatility')
		}
	})
})

describe('initWorkflow', () => {
	test('registers the cron handler with a Nitro TEE constraint', () => {
		const handlers = initWorkflow(makeConfig())
		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onUnderwritingTrigger)
		expect(handlers[0].requirements).toBeDefined()
	})
})
