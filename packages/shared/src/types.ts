// ============================================
// ShieldWall — Core Type Definitions
// ============================================

// ---- Chain & Network ----

export type ChainId = 1 | 10 | 56 | 137 | 8453 | 42161 | 43114;

export interface ChainConfig {
  id: ChainId;
  name: string;
  shortName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  /** Average block time in seconds */
  blockTime: number;
}

// ---- Transaction Interception ----

/** Raw transaction request as received from the dApp */
export interface RawTransaction {
  from: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  chainId?: string;
}

/** Types of signing requests we intercept */
export type InterceptedMethod =
  | 'eth_sendTransaction'
  | 'eth_signTransaction'
  | 'eth_sign'
  | 'personal_sign'
  | 'eth_signTypedData'
  | 'eth_signTypedData_v3'
  | 'eth_signTypedData_v4';

/** A signing request intercepted by the proxy */
export interface InterceptedRequest {
  id: string;
  method: InterceptedMethod;
  params: unknown[];
  chainId: ChainId;
  origin: string; // dApp origin URL
  timestamp: number;
  /** The raw transaction if method is eth_sendTransaction */
  transaction?: RawTransaction;
  /** Typed data if method is eth_signTypedData_v4 */
  typedData?: EIP712TypedData;
  /** Raw message if method is personal_sign */
  rawMessage?: string;
}

// ---- EIP-712 Typed Data ----

export interface EIP712TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  message: Record<string, unknown>;
}

// ---- Decoded Transaction ----

export interface DecodedFunction {
  /** Function name, e.g. "swap" */
  name: string;
  /** Function signature, e.g. "swap(address,uint256)" */
  signature: string;
  /** Decoded parameters */
  params: DecodedParam[];
  /** Known protocol, e.g. "Uniswap V3" */
  protocol?: string;
}

export interface DecodedParam {
  name: string;
  type: string;
  value: string;
  /** Human-readable label if available */
  label?: string;
}

// ---- Simulation Results ----

export interface SimulationResult {
  success: boolean;
  gasUsed: string;
  /** Token balance changes */
  balanceChanges: BalanceChange[];
  /** Token approval changes */
  approvalChanges: ApprovalChange[];
  /** Internal calls trace */
  internalCalls: InternalCall[];
  /** Estimated gas cost in USD */
  gasCostUsd?: number;
  /** Error message if simulation failed */
  error?: string;
  /** Raw logs */
  logs: SimulationLog[];
}

export interface BalanceChange {
  /** Token contract address, or "native" for ETH/BNB etc */
  token: string;
  /** Token symbol */
  symbol: string;
  /** Token decimals */
  decimals: number;
  /** Signed change amount (negative = outflow) */
  amount: string;
  /** USD value of the change */
  usdValue?: number;
  /** Token logo URL */
  logoUrl?: string;
}

export interface ApprovalChange {
  token: string;
  symbol: string;
  spender: string;
  /** Spender label if known, e.g. "Uniswap V3 Router" */
  spenderLabel?: string;
  /** Previous allowance */
  previousAllowance: string;
  /** New allowance — "unlimited" if MAX_UINT256 */
  newAllowance: string;
  /** Whether this is a revoke (newAllowance = 0) */
  isRevoke: boolean;
}

export interface InternalCall {
  from: string;
  to: string;
  value: string;
  /** Decoded function if ABI is known */
  decoded?: DecodedFunction;
  depth: number;
}

export interface SimulationLog {
  address: string;
  topics: string[];
  data: string;
  /** Decoded event if ABI is known */
  decoded?: {
    name: string;
    params: DecodedParam[];
  };
}

// ---- Contract Risk Assessment ----

export interface ContractRisk {
  address: string;
  chainId: ChainId;
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** Individual risk signals */
  signals: RiskSignal[];
  /** Contract metadata */
  metadata: ContractMetadata;
}

export interface ContractMetadata {
  /** Whether source code is verified on explorer */
  isVerified: boolean;
  /** Contract name from verified source */
  name?: string;
  /** Compiler version */
  compiler?: string;
  /** Whether it's a proxy contract */
  isProxy: boolean;
  /** Implementation address if proxy */
  implementationAddress?: string;
  /** Contract creation timestamp */
  createdAt?: number;
  /** Age in days */
  ageDays?: number;
  /** Number of unique interactors */
  uniqueUsers?: number;
  /** Total transaction count */
  txCount?: number;
  /** Known audit reports */
  audits: AuditReport[];
  /** Known protocol labels */
  labels: string[];
}

export interface AuditReport {
  auditor: string;
  date: string;
  url?: string;
}

export interface RiskSignal {
  type: RiskSignalType;
  severity: RiskLevel;
  title: string;
  description: string;
}

export type RiskSignalType =
  | 'unverified_source'
  | 'new_contract'
  | 'proxy_contract'
  | 'unlimited_approval'
  | 'known_phishing'
  | 'similar_to_phishing'
  | 'no_audit'
  | 'honeypot_pattern'
  | 'self_destruct'
  | 'delegatecall'
  | 'low_interaction'
  | 'suspicious_deployer'
  | 'blacklisted'
  | 'high_value_transfer'
  | 'unusual_gas';

// ---- AI Analysis ----

export interface AIAnalysis {
  /** Plain-language summary of what the transaction does */
  summary: string;
  /** Step-by-step breakdown */
  steps: string[];
  /** Identified risks in plain language */
  risks: string[];
  /** AI confidence level (0-1) */
  confidence: number;
  /** Recommended action */
  recommendation: 'approve' | 'caution' | 'reject';
  /** The model used */
  model: string;
}

// ---- Final Analysis Report ----

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface AnalysisReport {
  /** Unique analysis ID */
  id: string;
  /** The intercepted request */
  request: InterceptedRequest;
  /** Overall risk level */
  riskLevel: RiskLevel;
  /** Numeric risk score (0-100, higher = more dangerous) */
  riskScore: number;
  /** Decoded transaction info */
  decoded?: DecodedFunction;
  /** Simulation results */
  simulation?: SimulationResult;
  /** Contract risk assessment */
  contractRisk?: ContractRisk;
  /** AI semantic analysis */
  aiAnalysis?: AIAnalysis;
  /** Analysis duration in ms */
  analysisDurationMs: number;
  /** Timestamp */
  timestamp: number;
}

// ---- User Decision ----

export type UserDecision = 'approve' | 'reject' | 'timeout';

export interface AnalysisDecision {
  reportId: string;
  decision: UserDecision;
  timestamp: number;
}

// ---- Extension Messaging ----

export type MessageType =
  | 'INTERCEPTED_REQUEST'
  | 'ANALYSIS_RESULT'
  | 'USER_DECISION'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'REPORT_THREAT'
  | 'PING';

export interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload: T;
  requestId?: string;
}

// ---- User Settings ----

export interface UserSettings {
  /** Enable/disable the firewall */
  enabled: boolean;
  /** Auto-approve known safe contracts */
  autoApproveSafe: boolean;
  /** AI provider preference */
  aiProvider: 'openai' | 'ollama' | 'none';
  /** Enable transaction simulation */
  simulationEnabled: boolean;
  /** Risk threshold for auto-block (0-100) */
  autoBlockThreshold: number;
  /** Whitelisted contract addresses */
  whitelist: string[];
  /** Custom RPC URLs override */
  customRpcs: Partial<Record<ChainId, string>>;
  /** Show notifications */
  notifications: boolean;
}
