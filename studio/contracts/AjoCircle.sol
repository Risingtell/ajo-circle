// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AjoCircle
 * @notice A rotating savings circle (ajo/esusu) where members pay USDC each round
 *         and one member receives the pot. Funds are held in shared custody.
 * @dev SECURITY NOTICE: This contract holds USDC in shared custody. USDC implements
 *      issuer-controlled blocklisting. If this contract address is blocklisted by the
 *      USDC issuer, all member deposits and claimable funds held here become immovable.
 *      Users should be aware of this risk before joining a circle.
 */
contract AjoCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotStarted();
    error AlreadyStarted();
    error AlreadyFinished();
    error NotMember(address caller);
    error AlreadyJoined();
    error NotJoined();
    error AlreadyPaid();
    error NotYourTurn();
    error RoundNotOver();
    error AlreadyWithdrawn();
    error ZeroAddress();
    error InvalidContribution();
    error InvalidRoundSeconds();
    error TooFewMembers();
    error TooManyMembers();
    error DuplicateMember();
    error WrongRound(uint256 expected, uint256 provided);
    error NothingToClaim();
    error UnexpectedTransferAmount(uint256 expected, uint256 received);

    event Joined(address indexed member);
    event Left(address indexed member);
    event Started();
    event Contributed(address indexed member, uint256 indexed round);
    event Covered(address indexed member, uint256 indexed round, uint256 amount);
    event PaidOut(address indexed recipient, uint256 indexed round, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);
    event DepositWithdrawn(address indexed member, uint256 amount);
    event Finished();

    struct CircleStateView {
        string name;
        uint256 contribution;
        uint64 roundSeconds;
        uint256 currentRound;
        uint256 roundStart;
        uint256 roundDeadline;
        bool started;
        bool finished;
        address[] members;
        bool[] memberJoined;
        uint256[] memberDeposit;
        uint256[] memberMissed;
        uint256[] memberClaimable;
        address[] roundRecipient;
        uint256[] roundPot;
        bool[] roundPaidOut;
        bool[][] roundHasPaid;
        bool[][] roundCovered;
        uint256[] memberShortfall;
    }

    IERC20 private immutable _usdc;
    string private _name;
    address[] private _members;
    uint256 private immutable _contribution;
    uint64 private immutable _roundSeconds;

    uint256 public currentRound;
    uint256 public roundStart;
    bool public started;
    bool public finished;

    mapping(address => bool) public joined;
    mapping(address => uint256) public deposit;
    mapping(uint256 => mapping(address => bool)) public hasPaid;
    mapping(address => uint256) public missedPayments;
    mapping(uint256 => address) public recipientOf;
    mapping(uint256 => uint256) public potOf;
    mapping(uint256 => bool) public paidOut;
    mapping(address => uint256) public claimable;
    mapping(uint256 => mapping(address => bool)) public coveredByDeposit;
    mapping(address => uint256) public uncoveredMisses;

    mapping(address => bool) private _depositWithdrawn;
    mapping(address => bool) private _isMember;
    uint256 private _joinedCount;

    constructor(
        address usdc,
        string memory circleName,
        address[] memory members_,
        uint256 contribution_,
        uint64 roundSeconds_
    ) {
        if (usdc == address(0)) revert ZeroAddress();
        if (contribution_ == 0) revert InvalidContribution();
        if (roundSeconds_ < 60) revert InvalidRoundSeconds();

        uint256 memberLen = members_.length;
        if (memberLen < 2) revert TooFewMembers();
        if (memberLen > 20) revert TooManyMembers();

        for (uint256 i = 0; i < memberLen; i++) {
            address member = members_[i];
            if (member == address(0)) revert ZeroAddress();
            if (_isMember[member]) revert DuplicateMember();
            _isMember[member] = true;
        }

        _usdc = IERC20(usdc);
        _name = circleName;
        _members = members_;
        _contribution = contribution_;
        _roundSeconds = roundSeconds_;
    }

    function join() external nonReentrant {
        if (started) revert AlreadyStarted();
        if (!_isMember[msg.sender]) revert NotMember(msg.sender);
        if (joined[msg.sender]) revert AlreadyJoined();

        joined[msg.sender] = true;
        deposit[msg.sender] = _contribution;
        _joinedCount++;

        if (_joinedCount == _members.length) {
            started = true;
            roundStart = block.timestamp;
            emit Started();
        }

        uint256 balBefore = _usdc.balanceOf(address(this));
        _usdc.safeTransferFrom(msg.sender, address(this), _contribution);
        uint256 received = _usdc.balanceOf(address(this)) - balBefore;
        if (received != _contribution) revert UnexpectedTransferAmount(_contribution, received);
        emit Joined(msg.sender);
    }

    function leaveBeforeStart() external nonReentrant {
        if (started) revert AlreadyStarted();
        if (!joined[msg.sender]) revert NotJoined();

        joined[msg.sender] = false;
        uint256 amt = deposit[msg.sender];
        deposit[msg.sender] = 0;
        _joinedCount--;

        _usdc.safeTransfer(msg.sender, amt);
        emit Left(msg.sender);
    }

    function contribute(uint256 round) external nonReentrant {
        if (!started) revert NotStarted();
        if (finished) revert AlreadyFinished();
        if (round != currentRound) revert WrongRound(currentRound, round);
        if (!_isMember[msg.sender]) revert NotMember(msg.sender);
        if (!joined[msg.sender]) revert NotJoined();
        if (hasPaid[round][msg.sender]) revert AlreadyPaid();

        hasPaid[round][msg.sender] = true;
        potOf[round] += _contribution;

        uint256 balBefore = _usdc.balanceOf(address(this));
        _usdc.safeTransferFrom(msg.sender, address(this), _contribution);
        uint256 received = _usdc.balanceOf(address(this)) - balBefore;
        if (received != _contribution) revert UnexpectedTransferAmount(_contribution, received);
        emit Contributed(msg.sender, round);
    }

    function payout() external nonReentrant {
        if (!started) revert NotStarted();
        if (finished) revert AlreadyFinished();

        bool allPaid = _allPaidForRound(currentRound);
        if (!allPaid && block.timestamp < roundStart + _roundSeconds) {
            revert RoundNotOver();
        }

        uint256 round = currentRound;
        uint256 memberLen = _members.length;

        for (uint256 i = 0; i < memberLen; i++) {
            address member = _members[i];
            if (!hasPaid[round][member]) {
                uint256 dep = deposit[member];
                if (dep >= _contribution) {
                    deposit[member] = dep - _contribution;
                    hasPaid[round][member] = true;
                    potOf[round] += _contribution;
                    coveredByDeposit[round][member] = true;
                    emit Covered(member, round, _contribution);
                } else if (dep > 0) {
                    deposit[member] = 0;
                    potOf[round] += dep;
                    coveredByDeposit[round][member] = true;
                    emit Covered(member, round, dep);
                } else {
                    uncoveredMisses[member]++;
                }
                missedPayments[member]++;
            }
        }

        address recipient = _members[round];
        if (recipient == address(0)) revert ZeroAddress();

        recipientOf[round] = recipient;
        paidOut[round] = true;

        uint256 pot = potOf[round];

        if (round == memberLen - 1) {
            finished = true;
            emit Finished();
        } else {
            currentRound = round + 1;
            roundStart = block.timestamp;
        }

        claimable[recipient] += pot;
        emit PaidOut(recipient, round, pot);
    }

    function claim() external nonReentrant {
        uint256 amt = claimable[msg.sender];
        if (amt == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;
        _usdc.safeTransfer(msg.sender, amt);
        emit Claimed(msg.sender, amt);
    }

    function withdrawDeposit() external nonReentrant {
        if (!finished) revert NotStarted();
        if (!_isMember[msg.sender]) revert NotMember(msg.sender);
        if (_depositWithdrawn[msg.sender]) revert AlreadyWithdrawn();

        _depositWithdrawn[msg.sender] = true;
        uint256 amt = deposit[msg.sender];
        deposit[msg.sender] = 0;

        if (amt > 0) {
            _usdc.safeTransfer(msg.sender, amt);
        }

        emit DepositWithdrawn(msg.sender, amt);
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function members() external view returns (address[] memory) {
        return _members;
    }

    function contribution() external view returns (uint256) {
        return _contribution;
    }

    function roundSeconds() external view returns (uint64) {
        return _roundSeconds;
    }

    function roundDeadline() public view returns (uint256) {
        if (!started) {
            return 0;
        }
        return roundStart + _roundSeconds;
    }

    function memberCount() external view returns (uint256) {
        return _members.length;
    }

    function owedShortfall(address member) external view returns (uint256) {
        return uncoveredMisses[member] * _contribution;
    }

    function circleState() external view returns (CircleStateView memory stateView) {
        uint256 memberLen = _members.length;

        stateView.name = _name;
        stateView.contribution = _contribution;
        stateView.roundSeconds = _roundSeconds;
        stateView.currentRound = currentRound;
        stateView.roundStart = roundStart;
        stateView.roundDeadline = roundDeadline();
        stateView.started = started;
        stateView.finished = finished;

        stateView.members = new address[](memberLen);
        stateView.memberJoined = new bool[](memberLen);
        stateView.memberDeposit = new uint256[](memberLen);
        stateView.memberMissed = new uint256[](memberLen);
        stateView.memberClaimable = new uint256[](memberLen);
        stateView.memberShortfall = new uint256[](memberLen);

        for (uint256 i = 0; i < memberLen; i++) {
            address member = _members[i];
            stateView.members[i] = member;
            stateView.memberJoined[i] = joined[member];
            stateView.memberDeposit[i] = deposit[member];
            stateView.memberMissed[i] = missedPayments[member];
            stateView.memberClaimable[i] = claimable[member];
            stateView.memberShortfall[i] = uncoveredMisses[member] * _contribution;
        }

        stateView.roundRecipient = new address[](memberLen);
        stateView.roundPot = new uint256[](memberLen);
        stateView.roundPaidOut = new bool[](memberLen);
        stateView.roundHasPaid = new bool[][](memberLen);
        stateView.roundCovered = new bool[][](memberLen);

        for (uint256 round = 0; round < memberLen; round++) {
            stateView.roundRecipient[round] = recipientOf[round];
            stateView.roundPot[round] = potOf[round];
            stateView.roundPaidOut[round] = paidOut[round];

            bool[] memory paidByMember = new bool[](memberLen);
            for (uint256 memberIndex = 0; memberIndex < memberLen; memberIndex++) {
                paidByMember[memberIndex] = hasPaid[round][_members[memberIndex]];
            }
            stateView.roundHasPaid[round] = paidByMember;

            bool[] memory coveredByMember = new bool[](memberLen);
            for (uint256 memberIndex = 0; memberIndex < memberLen; memberIndex++) {
                coveredByMember[memberIndex] = coveredByDeposit[round][_members[memberIndex]];
            }
            stateView.roundCovered[round] = coveredByMember;
        }
    }

    function _allPaidForRound(uint256 round) internal view returns (bool) {
        uint256 memberLen = _members.length;
        for (uint256 i = 0; i < memberLen; i++) {
            if (!hasPaid[round][_members[i]]) {
                return false;
            }
        }
        return true;
    }
}
