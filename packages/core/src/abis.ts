// ============================================
// ShieldWall Core — Common Protocol ABIs
// ============================================
// Human-readable ABI fragments for popular DeFi protocols

/**
 * Map of protocol name → array of human-readable ABI signatures.
 * Used by the decoder to identify known function calls.
 */
export const COMMON_ABIS: Record<string, readonly string[]> = {
  // ---- ERC-20 Token ----
  'ERC-20': [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
    'function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)',
  ],

  // ---- ERC-721 NFT ----
  'ERC-721': [
    'function safeTransferFrom(address from, address to, uint256 tokenId)',
    'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
    'function transferFrom(address from, address to, uint256 tokenId)',
    'function approve(address to, uint256 tokenId)',
    'function setApprovalForAll(address operator, bool approved)',
  ],

  // ---- ERC-1155 Multi-Token ----
  'ERC-1155': [
    'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
    'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
    'function setApprovalForAll(address operator, bool approved)',
  ],

  // ---- Uniswap V2 Router ----
  'Uniswap V2': [
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
    'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
  ],

  // ---- Uniswap V3 SwapRouter ----
  'Uniswap V3': [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)',
    'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) returns (uint256 amountOut)',
    'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) returns (uint256 amountIn)',
    'function exactOutput((bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum)) returns (uint256 amountIn)',
    'function multicall(uint256 deadline, bytes[] data) returns (bytes[] results)',
    'function multicall(bytes32 previousBlockhash, bytes[] data) returns (bytes[] results)',
    'function multicall(bytes[] data) returns (bytes[] results)',
  ],

  // ---- Uniswap Universal Router ----
  'Uniswap Universal Router': [
    'function execute(bytes commands, bytes[] inputs, uint256 deadline)',
    'function execute(bytes commands, bytes[] inputs)',
  ],

  // ---- Permit2 ----
  'Permit2': [
    'function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)',
    'function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce)[] details, address spender, uint256 sigDeadline) permitBatch, bytes signature)',
    'function transferFrom(address from, address to, uint160 amount, address token)',
  ],

  // ---- AAVE V3 ----
  'Aave V3': [
    'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
    'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
    'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
    'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
    'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken)',
  ],

  // ---- WETH ----
  'WETH': [
    'function deposit() payable',
    'function withdraw(uint256 wad)',
  ],

  // ---- OpenSea Seaport ----
  'Seaport': [
    'function fulfillBasicOrder((address considerationToken, uint256 considerationIdentifier, uint256 considerationAmount, address offerer, address zone, address offerToken, uint256 offerIdentifier, uint256 offerAmount, uint8 basicOrderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 offererConduitKey, bytes32 fulfillerConduitKey, uint256 totalOriginalAdditionalRecipients, (uint256 amount, address recipient)[] additionalRecipients, bytes signature) parameters) returns (bool fulfilled)',
    'function fulfillOrder((address offerer, address zone, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, (uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) order, bytes32 fulfillerConduitKey) returns (bool fulfilled)',
  ],
} as const;
