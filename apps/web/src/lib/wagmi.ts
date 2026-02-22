import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { 
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
  coinbaseWallet,
  phantomWallet,
  rabbyWallet,
  trustWallet,
  ledgerWallet,
  safeWallet,
  zerionWallet,
  okxWallet,
  argentWallet,
  braveWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { base } from 'wagmi/chains';

// WalletConnect Cloud project ID
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '3a8170812b534d0ff9d794f19a901d64';

export const config = getDefaultConfig({
  appName: 'PaySpawn',
  projectId,
  chains: [base],
  ssr: true,
  wallets: [
    {
      // Top group - most common wallets including Phantom prominently
      groupName: 'Connect Wallet',
      wallets: [
        phantomWallet,        // Explicitly first so mobile Phantom users see it immediately
        metaMaskWallet,
        coinbaseWallet,
        walletConnectWallet,  // Universal - opens WalletConnect's full wallet explorer (300+ wallets)
        injectedWallet,       // Catches in-app browsers (Phantom browser, etc.)
      ],
    },
    {
      groupName: 'More Wallets',
      wallets: [
        trustWallet,
        rabbyWallet,
        zerionWallet,
        okxWallet,
        rainbowWallet,
        argentWallet,
        braveWallet,
        ledgerWallet,
        safeWallet,
      ],
    },
  ],
});
