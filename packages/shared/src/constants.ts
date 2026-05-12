import type { ChainConfig, ChainId, UserSettings } from './types';

// ============================================
// Supported Chain Configurations
// ============================================

export const CHAINS: Record<ChainId, ChainConfig> = {
  1: {
    id: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    explorerApiUrl: 'https://api.etherscan.io/api',
    blockTime: 12,
  },
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'OP',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    explorerApiUrl: 'https://api-optimistic.etherscan.io/api',
    blockTime: 2,
  },
  56: {
    id: 56,
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    explorerUrl: 'https://bscscan.com',
    explorerApiUrl: 'https://api.bscscan.com/api',
    blockTime: 3,
  },
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    explorerApiUrl: 'https://api.polygonscan.com/api',
    blockTime: 2,
  },
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'BASE',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    explorerApiUrl: 'https://api.basescan.org/api',
    blockTime: 2,
  },
  42161: {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    explorerApiUrl: 'https://api.arbiscan.io/api',
    blockTime: 0.25,
  },
  43114: {
    id: 43114,
    name: 'Avalanche C-Chain',
    shortName: 'AVAX',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowscan.xyz',
    explorerApiUrl: 'https://api.snowscan.xyz/api',
    blockTime: 2,
  },
};

// ============================================
// Well-Known Contract Labels
// ============================================

/** Map of well-known contract addresses to human labels */
export const KNOWN_CONTRACTS: Record<string, string> = {
  // Uniswap
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3: SwapRouter02',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3: SwapRouter',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap: Universal Router',
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2: Router',
  // OpenSea
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'OpenSea: Seaport 1.5',
  '0x0000000000000068f116a894984e2db1123eb395': 'OpenSea: Seaport 1.6',
  // 1inch
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch: AggregationRouter V6',
  // AAVE
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3: Pool',
  // Lido
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'Lido: stETH',
  // Curve
  '0x99a58482bd75cbab83b27ec03ca68ff489b5788f': 'Curve: Router',
  // Permit2
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Uniswap: Permit2',
};

// ============================================
// Known Phishing Patterns
// ============================================

export const PHISHING_SIGNATURES = [
  // Common drainer function signatures
  'multicall(bytes[])',
  'SecurityUpdate()',
  'ClaimRewards()',
  'claim(address)',
  'connect(string)',
  'Multicall(uint256,bytes[])',
] as const;

// ============================================
// Risk Score Thresholds
// ============================================

export const RISK_THRESHOLDS = {
  SAFE: 20,
  LOW: 40,
  MEDIUM: 60,
  HIGH: 80,
  CRITICAL: 100,
} as const;

// ============================================
// Default User Settings
// ============================================

export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  autoApproveSafe: false,
  aiProvider: 'openai',
  simulationEnabled: true,
  autoBlockThreshold: 85,
  whitelist: [],
  customRpcs: {},
  notifications: true,
};

// ============================================
// Extension Constants
// ============================================

export const EXTENSION = {
  /** Message channel name between injected script and content script */
  CHANNEL_NAME: 'shieldwall-channel',
  /** Storage key prefix */
  STORAGE_PREFIX: 'shieldwall_',
  /** Analysis timeout in ms */
  ANALYSIS_TIMEOUT: 30_000,
  /** Max entries in analysis history */
  MAX_HISTORY: 500,
} as const;

// ============================================
// ERC-20 Common ABI Fragments
// ============================================

export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const;
