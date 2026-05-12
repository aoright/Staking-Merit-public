// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/MeritNFT.sol";
import "../src/ThreatRegistry.sol";

/**
 * @title DeployMerit
 * @notice Deploy MeritNFT and link to existing ThreatRegistry.
 */
contract DeployMerit is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        
        // Existing ThreatRegistry address
        address registryAddr = 0xc8c6a3Bf86B5Bc3d7c3F43605f54EE9D1e589549;
        
        vm.startBroadcast(deployerKey);

        // 1. Deploy MeritNFT
        MeritNFT meritNFT = new MeritNFT(registryAddr);
        console.log("MeritNFT deployed at:", address(meritNFT));

        // 2. Link to ThreatRegistry
        ThreatRegistry registry = ThreatRegistry(payable(registryAddr));
        registry.setMeritNFT(address(meritNFT));
        console.log("MeritNFT linked to ThreatRegistry");

        vm.stopBroadcast();
    }
}
