// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title PaySpawnNames
 * @notice Decentralized name registry for PaySpawn. Names are permanent and user-owned.
 * @dev Names are lowercase, 3-20 chars, start with letter, alphanumeric + hyphens only.
 */
contract PaySpawnNames {
    /// @notice Maps name to owner address
    mapping(string => address) public resolve;
    
    /// @notice Maps address to their registered name
    mapping(address => string) public nameOf;
    
    /// @notice Emitted when a name is registered
    event NameRegistered(string indexed nameHash, string name, address indexed owner);
    
    /// @notice Emitted when a name is transferred
    event NameTransferred(string indexed nameHash, string name, address indexed from, address indexed to);

    /// @notice Register a name for the caller
    /// @param name The name to register (without .pay suffix)
    function register(string calldata name) external {
        require(isValidName(name), "Invalid name format");
        require(resolve[name] == address(0), "Name already taken");
        require(bytes(nameOf[msg.sender]).length == 0, "Address already has a name");
        
        resolve[name] = msg.sender;
        nameOf[msg.sender] = name;
        
        emit NameRegistered(name, name, msg.sender);
    }
    
    /// @notice Transfer your name to another address
    /// @param to The address to transfer the name to
    function transfer(address to) external {
        require(to != address(0), "Cannot transfer to zero address");
        require(to != msg.sender, "Cannot transfer to self");
        require(bytes(nameOf[to]).length == 0, "Recipient already has a name");
        
        string memory name = nameOf[msg.sender];
        require(bytes(name).length > 0, "You don't have a name");
        
        // Update mappings
        resolve[name] = to;
        nameOf[to] = name;
        delete nameOf[msg.sender];
        
        emit NameTransferred(name, name, msg.sender, to);
    }
    
    /// @notice Check if a name is available
    /// @param name The name to check
    /// @return True if available
    function isAvailable(string calldata name) external view returns (bool) {
        return resolve[name] == address(0);
    }
    
    /// @notice Validate name format
    /// @param name The name to validate
    /// @return True if valid
    function isValidName(string calldata name) public pure returns (bool) {
        bytes memory b = bytes(name);
        
        // Length check: 3-20 characters
        if (b.length < 3 || b.length > 20) return false;
        
        // First character must be a-z
        if (b[0] < 0x61 || b[0] > 0x7a) return false;
        
        // Rest must be a-z, 0-9, or hyphen
        for (uint i = 1; i < b.length; i++) {
            bytes1 c = b[i];
            bool isLower = (c >= 0x61 && c <= 0x7a);  // a-z
            bool isDigit = (c >= 0x30 && c <= 0x39);  // 0-9
            bool isHyphen = (c == 0x2d);              // -
            
            if (!isLower && !isDigit && !isHyphen) return false;
        }
        
        // Cannot end with hyphen
        if (b[b.length - 1] == 0x2d) return false;
        
        return true;
    }
}
