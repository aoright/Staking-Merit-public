// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/ThreatRegistry.sol";
import "../src/MeritNFT.sol";
import "../src/ShieldWallFactory.sol";

/**
 * @title Deploy
 * @notice Deployment script for ShieldWall contracts on Monad Testnet.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url https://testnet-rpc.monad.xyz \
 *     --broadcast \
 *     --private-key $PRIVATE_KEY \
 *     --with-gas-price 120000000000
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy ThreatRegistry
        ThreatRegistry registry = new ThreatRegistry();
        console.log("ThreatRegistry deployed at:", address(registry));

        // 2. Deploy MeritNFT (linked to ThreatRegistry)
        MeritNFT meritNFT = new MeritNFT(address(registry));
        console.log("MeritNFT deployed at:", address(meritNFT));

        // 3. Link MeritNFT to ThreatRegistry
        registry.setMeritNFT(address(meritNFT));
        console.log("MeritNFT linked to ThreatRegistry");

        // 4. Deploy ShieldWallFactory (links to ThreatRegistry)
        ShieldWallFactory factory = new ShieldWallFactory(address(registry));
        console.log("ShieldWallFactory deployed at:", address(factory));

        // 5. Seed the reward pool with some MON
        (bool ok, ) = payable(address(registry)).call{value: 0.1 ether}("");
        require(ok, "Failed to seed registry");

        vm.stopBroadcast();

        console.log("---");
        console.log("Deployment complete on Monad Testnet!");
        console.log("Chain ID: 10143");
    }
}
