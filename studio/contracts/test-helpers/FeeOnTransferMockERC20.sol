// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Fee-on-transfer ERC-20 mock: on every transferFrom, recipient receives
///      `amount - 1` and the contract retains 1 unit as a fee.
///      Used to exercise the UnexpectedTransferAmount guard in AjoCircle.
contract FeeOnTransferMockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "FeeToken: insufficient balance");
        uint256 fee = amount > 0 ? 1 : 0;
        uint256 received = amount - fee;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += received;
        // fee stays in this contract (balanceOf[address(this)] += fee implicitly via totalSupply accounting)
        balanceOf[address(this)] += fee;
        emit Transfer(msg.sender, to, received);
        return true;
    }

    /// @notice transferFrom deducts `amount` from `from` but only credits `amount - 1`
    ///         to `to`, retaining 1 unit as a fee in this contract.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "FeeToken: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        require(balanceOf[from] >= amount, "FeeToken: insufficient balance");

        uint256 fee = amount > 0 ? 1 : 0;
        uint256 received = amount - fee;

        balanceOf[from] -= amount;
        balanceOf[to] += received;
        balanceOf[address(this)] += fee;

        emit Transfer(from, to, received);
        return true;
    }
}
