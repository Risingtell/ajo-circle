// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AjoCircle} from "./AjoCircle.sol";

contract AjoFactory {
    error ZeroAddress();
    error NotAContract(address addr);

    event CircleCreated(address indexed circle, address indexed creator, string name);

    address public immutable usdc;
    address[] private _allCircles;
    mapping(address => address[]) private _circlesOf;
    mapping(address => address) public creatorOf;

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (usdc_.code.length == 0) revert NotAContract(usdc_);
        usdc = usdc_;
    }

    function createCircle(
        string calldata circleName,
        address[] calldata members,
        uint256 contribution,
        uint64 roundSeconds
    ) external returns (address) {
        AjoCircle circle = new AjoCircle(usdc, circleName, members, contribution, roundSeconds);
        address circleAddress = address(circle);

        _allCircles.push(circleAddress);
        creatorOf[circleAddress] = msg.sender;

        uint256 memberLen = members.length;
        for (uint256 i = 0; i < memberLen; i++) {
            _circlesOf[members[i]].push(circleAddress);
        }

        emit CircleCreated(circleAddress, msg.sender, circleName);
        return circleAddress;
    }

    function allCircles() external view returns (address[] memory) {
        return _allCircles;
    }

    function circlesOf(address member) external view returns (address[] memory) {
        return _circlesOf[member];
    }
}
