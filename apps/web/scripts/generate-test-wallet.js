const { generatePrivateKey, privateKeyToAddress } = require('viem/accounts');

const privateKey = generatePrivateKey();
const address = privateKeyToAddress(privateKey);

console.log('=== TEST WALLET GENERATED ===');
console.log('Address:', address);
console.log('Private Key:', privateKey);
console.log('');
console.log('NEXT STEPS:');
console.log('1. Send ~$1 USDC to this address on Base');
console.log('2. Send ~$0.01 ETH for gas on Base');
console.log('3. Run the setup script to approve router + set policy');
