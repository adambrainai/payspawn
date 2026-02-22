import express from 'express';
import cors from 'cors';
import { Turnkey } from '@turnkey/sdk-server';
import dotenv from 'dotenv';
import path from 'path';
import { createPublicClient, createWalletClient, http, parseUnits, encodeFunctionData, type Hex } from 'viem';
import { base } from 'viem/chains';

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Contract addresses (Base Mainnet V2)
const CONTRACTS = {
  policy: '0xbD55962D570f4E9843F7300002781aB68F51a09B' as const,
  router: '0xB3Bd641350010E14Ca2f7139793F19c2A3e26683' as const,
};

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

// ABIs (minimal for what we need)
const POLICY_ABI = [
  {
    name: 'createPolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'dailyLimit', type: 'uint256' },
      { name: 'perTxLimit', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'getPolicy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'human', type: 'address' },
          { name: 'agent', type: 'address' },
          { name: 'dailyLimit', type: 'uint256' },
          { name: 'perTxLimit', type: 'uint256' },
          { name: 'dailySpent', type: 'uint256' },
          { name: 'lastResetDay', type: 'uint256' },
          { name: 'paused', type: 'bool' },
        ],
      },
    ],
  },
] as const;

const ROUTER_ABI = [
  {
    name: 'pay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Initialize Turnkey client
const turnkey = new Turnkey({
  apiBaseUrl: 'https://api.turnkey.com',
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
  defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
});

// Viem public client for reading chain state
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// In-memory store for wallet mappings (in production, use a database)
const walletStore: Map<string, { walletId: string; address: string; owner: string }> = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    contracts: CONTRACTS,
  });
});

/**
 * Create a new agent wallet
 * POST /api/agents
 */
app.post('/api/agents', async (req, res) => {
  try {
    const { owner, name, dailyLimit = 100, perTxLimit = 10 } = req.body;

    if (!owner) {
      return res.status(400).json({ error: 'owner address is required' });
    }

    const walletName = name || `agent-${Date.now()}`;
    const apiClient = turnkey.apiClient();
    
    // Create wallet via Turnkey
    const createWalletResponse = await apiClient.createWallet({
      walletName,
      accounts: [
        {
          curve: 'CURVE_SECP256K1',
          pathFormat: 'PATH_FORMAT_BIP32',
          path: "m/44'/60'/0'/0/0",
          addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
        },
      ],
    });

    const walletId = createWalletResponse.walletId;
    const walletAddress = createWalletResponse.addresses[0];

    if (!walletAddress) {
      throw new Error('Failed to get wallet address from Turnkey');
    }

    // Store wallet mapping
    walletStore.set(walletAddress.toLowerCase(), { walletId, address: walletAddress, owner });

    // Return agent details
    res.json({
      success: true,
      agent: {
        id: walletId,
        name: walletName,
        address: walletAddress,
        owner,
        limits: {
          daily: dailyLimit,
          perTx: perTxLimit,
        },
        createdAt: new Date().toISOString(),
      },
      contracts: CONTRACTS,
      instructions: {
        step1: 'Fund the agent wallet with USDC on Base',
        step2: `Owner must call createPolicy(${walletAddress}, ${parseUnits(dailyLimit.toString(), 6)}, ${parseUnits(perTxLimit.toString(), 6)}) on PolicyContract`,
        step3: 'Agent can now make payments via POST /api/agents/:address/pay',
      },
    });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    res.status(500).json({
      error: 'Failed to create agent wallet',
      details: error.message,
    });
  }
});

/**
 * Get agent info
 * GET /api/agents/:address
 */
app.get('/api/agents/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const wallet = walletStore.get(address.toLowerCase());

    if (!wallet) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get USDC balance
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    // Try to get on-chain policy
    let policy = null;
    try {
      const policyData = await publicClient.readContract({
        address: CONTRACTS.policy,
        abi: POLICY_ABI,
        functionName: 'getPolicy',
        args: [address as `0x${string}`],
      });
      policy = {
        human: policyData.human,
        dailyLimit: policyData.dailyLimit.toString(),
        perTxLimit: policyData.perTxLimit.toString(),
        dailySpent: policyData.dailySpent.toString(),
        paused: policyData.paused,
      };
    } catch (e) {
      // Policy not created yet
    }

    res.json({
      success: true,
      agent: {
        address: wallet.address,
        owner: wallet.owner,
        balance: {
          usdc: (Number(balance) / 1e6).toFixed(2),
          raw: balance.toString(),
        },
        policy,
        policyCreated: policy !== null && policy.human !== '0x0000000000000000000000000000000000000000',
      },
    });
  } catch (error: any) {
    console.error('Error getting agent:', error);
    res.status(500).json({
      error: 'Failed to get agent',
      details: error.message,
    });
  }
});

/**
 * Make a payment from an agent
 * POST /api/agents/:address/pay
 */
app.post('/api/agents/:address/pay', async (req, res) => {
  try {
    const { address } = req.params;
    const { to, amount, token = 'USDC' } = req.body;

    if (!to || !amount) {
      return res.status(400).json({ error: 'to and amount are required' });
    }

    const wallet = walletStore.get(address.toLowerCase());
    if (!wallet) {
      return res.status(404).json({ error: 'Agent not found. Create agent first via POST /api/agents' });
    }

    const tokenAddress = token === 'USDC' ? USDC_ADDRESS : token;
    const amountWei = parseUnits(amount.toString(), 6); // USDC has 6 decimals

    const apiClient = turnkey.apiClient();

    // Check allowance first
    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address as `0x${string}`, CONTRACTS.router],
    });

    // If not enough allowance, approve first
    if (allowance < amountWei) {
      console.log('Approving router to spend USDC...');
      
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.router, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')], // Max approval
      });

      const nonce = await publicClient.getTransactionCount({ address: address as `0x${string}` });
      const gasPrice = await publicClient.getGasPrice();

      const approveTx = {
        to: tokenAddress,
        data: approveData,
        value: '0x0',
        nonce: `0x${nonce.toString(16)}`,
        gasLimit: '0x20000', // 131072
        gasPrice: `0x${gasPrice.toString(16)}`,
        chainId: '0x2105', // Base mainnet (8453)
        type: '0x0', // Legacy transaction
      };

      const signedApprove = await apiClient.signTransaction({
        signWith: wallet.address,
        unsignedTransaction: JSON.stringify(approveTx),
        type: 'TRANSACTION_TYPE_ETHEREUM',
      });

      const approveTxHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedApprove.signedTransaction as Hex,
      });

      console.log('Approve tx:', approveTxHash);
      
      // Wait for approval to confirm
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    }

    // Now make the payment through the router
    const payData = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'pay',
      args: [tokenAddress, to as `0x${string}`, amountWei],
    });

    const nonce = await publicClient.getTransactionCount({ address: address as `0x${string}` });
    const gasPrice = await publicClient.getGasPrice();

    const payTx = {
      to: CONTRACTS.router,
      data: payData,
      value: '0x0',
      nonce: `0x${nonce.toString(16)}`,
      gasLimit: '0x40000', // 262144
      gasPrice: `0x${gasPrice.toString(16)}`,
      chainId: '0x2105',
      type: '0x0',
    };

    const signedPay = await apiClient.signTransaction({
      signWith: wallet.address,
      unsignedTransaction: JSON.stringify(payTx),
      type: 'TRANSACTION_TYPE_ETHEREUM',
    });

    const payTxHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedPay.signedTransaction as Hex,
    });

    res.json({
      success: true,
      transaction: {
        hash: payTxHash,
        from: address,
        to,
        amount,
        token,
        explorer: `https://basescan.org/tx/${payTxHash}`,
      },
    });
  } catch (error: any) {
    console.error('Error making payment:', error);
    res.status(500).json({
      error: 'Failed to make payment',
      details: error.message,
    });
  }
});

/**
 * List all agents
 * GET /api/agents
 */
app.get('/api/agents', async (req, res) => {
  try {
    const agents = Array.from(walletStore.values()).map(w => ({
      address: w.address,
      owner: w.owner,
    }));

    res.json({
      success: true,
      count: agents.length,
      agents,
    });
  } catch (error: any) {
    console.error('Error listing agents:', error);
    res.status(500).json({
      error: 'Failed to list agents',
      details: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PaySpawn API running on http://localhost:${PORT}`);
  console.log(`📋 Contracts:`);
  console.log(`   Policy: ${CONTRACTS.policy}`);
  console.log(`   Router: ${CONTRACTS.router}`);
  console.log(`🔑 Turnkey Org: ${process.env.TURNKEY_ORGANIZATION_ID}`);
});
