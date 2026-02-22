# PaySpawn Smart Contracts

Non-custodial payment infrastructure for AI agents on Base.

## Deployed Contracts (Base Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| PaySpawnPolicy | [`0xbD55962D570f4E9843F7300002781aB68F51a09B`](https://basescan.org/address/0xbD55962D570f4E9843F7300002781aB68F51a09B) | On-chain spending limits |
| PaySpawnRouter | [`0xB3Bd641350010E14Ca2f7139793F19c2A3e26683`](https://basescan.org/address/0xB3Bd641350010E14Ca2f7139793F19c2A3e26683) | Payment routing + fees |
| PaySpawnNames | [`0xc653c91524B5D72Adb767151d30b606A727be2E4`](https://basescan.org/address/0xc653c91524B5D72Adb767151d30b606A727be2E4) | Decentralized name registry |

## Architecture

### PaySpawnPolicy
- Users create spending policies for their wallets
- Enforces daily limits and per-transaction limits
- Includes pause/unpause (kill switch) functionality
- Only the policy owner can modify their own policy

### PaySpawnRouter
- Routes payments from user wallets to recipients
- Collects 0.1% fee on all transactions
- Calls policy contract to verify spending limits
- Uses `transferFrom` pattern (requires user approval)

### PaySpawnNames
- Decentralized name registry (like ENS but simpler)
- Names are permanent and user-owned
- Format: `name.pay` (3-20 chars, alphanumeric + hyphens)
- No admin functions - fully permissionless

## Development

### Build
```bash
forge build
```

### Test
```bash
forge test
```

### Deploy
```bash
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
```

## Security

- All contracts are verified on Basescan/Sourcify
- Policy contract enforces limits regardless of API state
- Users can revoke router approval at any time
- Names contract has no admin functions

## License

MIT
