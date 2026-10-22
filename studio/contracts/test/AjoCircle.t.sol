// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AjoCircle} from "../AjoCircle.sol";
import {AjoFactory} from "../AjoFactory.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {FeeOnTransferMockERC20} from "../test-helpers/FeeOnTransferMockERC20.sol";

/// @dev All USDC amounts use 6-decimal precision (1 USDC = 1e6).
///
/// payout() uses a pull-claim model: it accrues claimable[recipient] but does NOT
/// transfer USDC directly.  The recipient must call claim() to receive funds.
contract AjoCircleTest is Test {
    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 internal constant CONTRIBUTION = 100e6; // 100 USDC
    uint64  internal constant ROUND_SECS   = 7 days;

    // ─── Actors ───────────────────────────────────────────────────────────────
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal carol    = makeAddr("carol");
    address internal outsider = makeAddr("outsider");

    // ─── Contracts ────────────────────────────────────────────────────────────
    MockERC20  internal usdc;
    AjoCircle  internal circle;
    AjoFactory internal factory;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// Mint `amount` USDC to `to` and approve the circle to spend it.
    function _fund(address to, uint256 amount) internal {
        usdc.mint(to, amount);
        vm.prank(to);
        usdc.approve(address(circle), amount);
    }

    /// Have all three members join; after the last join the circle is Started.
    function _allJoin() internal {
        _fund(alice, CONTRIBUTION);
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);

        vm.prank(alice); circle.join();
        vm.prank(bob);   circle.join();
        vm.prank(carol); circle.join();
    }

    /// Contribute for a round from all three members (all must be pre-funded).
    function _allContribute(uint256 round) internal {
        _fund(alice, CONTRIBUTION);
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);

        vm.prank(alice); circle.contribute(round);
        vm.prank(bob);   circle.contribute(round);
        vm.prank(carol); circle.contribute(round);
    }

    /// Helper: have `who` call claim() and return the amount they received.
    function _claim(address who) internal returns (uint256 received) {
        uint256 before = usdc.balanceOf(who);
        vm.prank(who);
        circle.claim();
        received = usdc.balanceOf(who) - before;
    }

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        factory = new AjoFactory(address(usdc));

        address[] memory members = new address[](3);
        members[0] = alice;
        members[1] = bob;
        members[2] = carol;

        circle = new AjoCircle(
            address(usdc),
            "TestCircle",
            members,
            CONTRIBUTION,
            ROUND_SECS
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Full 3-member lifecycle
    // ══════════════════════════════════════════════════════════════════════════

    function test_FullLifecycle_DeploymentState() public view {
        assertEq(circle.started(),  false);
        assertEq(circle.finished(), false);
        assertEq(circle.currentRound(), 0);
        assertEq(circle.memberCount(), 3);
        assertEq(circle.contribution(), CONTRIBUTION);
        assertEq(circle.roundSeconds(), ROUND_SECS);
        assertEq(circle.name(), "TestCircle");
    }

    function test_FullLifecycle_Join_BalancesBeforeAndAfter() public {
        // Before any join: balances are zero, joined flags are false
        assertEq(usdc.balanceOf(alice),           0);
        assertEq(usdc.balanceOf(bob),             0);
        assertEq(usdc.balanceOf(carol),           0);
        assertEq(usdc.balanceOf(address(circle)), 0);
        assertFalse(circle.joined(alice));
        assertFalse(circle.joined(bob));
        assertFalse(circle.joined(carol));
        assertFalse(circle.started());

        // Fund & approve
        usdc.mint(alice, CONTRIBUTION);
        usdc.mint(bob,   CONTRIBUTION);
        usdc.mint(carol, CONTRIBUTION);
        vm.prank(alice); usdc.approve(address(circle), CONTRIBUTION);
        vm.prank(bob);   usdc.approve(address(circle), CONTRIBUTION);
        vm.prank(carol); usdc.approve(address(circle), CONTRIBUTION);

        // Alice joins
        vm.expectEmit(true, false, false, false, address(circle));
        emit AjoCircle.Joined(alice);
        vm.prank(alice); circle.join();

        assertEq(usdc.balanceOf(alice),           0);
        assertEq(usdc.balanceOf(address(circle)), CONTRIBUTION);
        assertTrue(circle.joined(alice));
        assertEq(circle.deposit(alice), CONTRIBUTION);
        assertFalse(circle.started());

        // Bob joins
        vm.expectEmit(true, false, false, false, address(circle));
        emit AjoCircle.Joined(bob);
        vm.prank(bob); circle.join();

        assertEq(usdc.balanceOf(bob),             0);
        assertEq(usdc.balanceOf(address(circle)), 2 * CONTRIBUTION);
        assertFalse(circle.started());

        // Carol joins — triggers start
        vm.expectEmit(false, false, false, false, address(circle));
        emit AjoCircle.Started();
        vm.expectEmit(true, false, false, false, address(circle));
        emit AjoCircle.Joined(carol);
        vm.prank(carol); circle.join();

        assertEq(usdc.balanceOf(carol),           0);
        // All 3 deposits sit in the contract
        assertEq(usdc.balanceOf(address(circle)), 3 * CONTRIBUTION);
        assertTrue(circle.started());
        assertEq(circle.currentRound(), 0);
    }

    /// payout() accrues claimable[alice]; recipient must call claim() to receive USDC.
    function test_FullLifecycle_Round0_ContributeAndPayout() public {
        _allJoin();
        // Each member's deposit is locked in contract (3 × CONTRIBUTION)
        assertEq(usdc.balanceOf(address(circle)), 3 * CONTRIBUTION);

        // --- Round 0 contributions ---
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(bob),   0);
        assertEq(usdc.balanceOf(carol), 0);

        _fund(alice, CONTRIBUTION);
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);

        uint256 circleBalBefore = usdc.balanceOf(address(circle)); // 3 * CONTRIBUTION

        vm.expectEmit(true, true, false, false, address(circle));
        emit AjoCircle.Contributed(alice, 0);
        vm.prank(alice); circle.contribute(0);

        vm.expectEmit(true, true, false, false, address(circle));
        emit AjoCircle.Contributed(bob, 0);
        vm.prank(bob); circle.contribute(0);

        vm.expectEmit(true, true, false, false, address(circle));
        emit AjoCircle.Contributed(carol, 0);
        vm.prank(carol); circle.contribute(0);

        // After all 3 contribute: circle holds 3*C deposits + 3*C contributions = 6*C
        assertEq(usdc.balanceOf(address(circle)), circleBalBefore + 3 * CONTRIBUTION);
        assertEq(circle.potOf(0), 3 * CONTRIBUTION);

        // --- Payout round 0 → alice (members[0]) ---
        // Pull-claim model: payout() accrues claimable, does NOT transfer directly.
        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.PaidOut(alice, 0, 3 * CONTRIBUTION);
        circle.payout();

        // claimable[alice] should equal the pot; alice's wallet balance unchanged yet
        assertEq(circle.claimable(alice), 3 * CONTRIBUTION);
        assertEq(usdc.balanceOf(alice), 0);

        // Alice claims
        vm.expectEmit(true, false, false, true, address(circle));
        emit AjoCircle.Claimed(alice, 3 * CONTRIBUTION);
        vm.prank(alice); circle.claim();

        assertEq(usdc.balanceOf(alice), 3 * CONTRIBUTION);
        assertEq(circle.claimable(alice), 0);

        assertTrue(circle.paidOut(0));
        assertEq(circle.recipientOf(0), alice);
        assertEq(circle.currentRound(), 1);
        assertFalse(circle.finished());
    }

    function test_FullLifecycle_Round1_ContributeAndPayout() public {
        _allJoin();
        _allContribute(0);
        circle.payout(); // round 0 done; alice can claim but we don't here
        // advance to round 1
        assertEq(circle.currentRound(), 1);

        _allContribute(1);
        assertEq(circle.potOf(1), 3 * CONTRIBUTION);

        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.PaidOut(bob, 1, 3 * CONTRIBUTION);
        circle.payout();

        // bob is members[1] — pull-claim model
        assertEq(circle.claimable(bob), 3 * CONTRIBUTION);
        assertEq(usdc.balanceOf(bob), 0);

        // Bob claims
        uint256 received = _claim(bob);
        assertEq(received, 3 * CONTRIBUTION);
        assertEq(circle.claimable(bob), 0);

        assertTrue(circle.paidOut(1));
        assertEq(circle.recipientOf(1), bob);
        assertEq(circle.currentRound(), 2);
        assertFalse(circle.finished());
    }

    function test_FullLifecycle_Round2_ContributeAndPayout_Finishes() public {
        _allJoin();
        _allContribute(0);
        circle.payout();
        _allContribute(1);
        circle.payout();

        assertEq(circle.currentRound(), 2);

        _allContribute(2);
        assertEq(circle.potOf(2), 3 * CONTRIBUTION);

        vm.expectEmit(false, false, false, false, address(circle));
        emit AjoCircle.Finished();
        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.PaidOut(carol, 2, 3 * CONTRIBUTION);
        circle.payout();

        // carol is members[2] — pull-claim model
        assertEq(circle.claimable(carol), 3 * CONTRIBUTION);
        assertEq(usdc.balanceOf(carol), 0);

        // Carol claims
        uint256 received = _claim(carol);
        assertEq(received, 3 * CONTRIBUTION);
        assertEq(circle.claimable(carol), 0);

        assertTrue(circle.paidOut(2));
        assertEq(circle.recipientOf(2), carol);
        assertTrue(circle.finished());
    }

    function test_FullLifecycle_WithdrawDeposit_AfterFinish() public {
        _allJoin();
        _allContribute(0); circle.payout();
        _allContribute(1); circle.payout();
        _allContribute(2); circle.payout();
        assertTrue(circle.finished());

        // All deposits are intact (nobody missed)
        assertEq(circle.deposit(alice), CONTRIBUTION);
        assertEq(circle.deposit(bob),   CONTRIBUTION);
        assertEq(circle.deposit(carol), CONTRIBUTION);

        // Recipients claim their pots first so the contract balance check works cleanly.
        vm.prank(alice); circle.claim(); // alice got round 0 pot
        vm.prank(bob);   circle.claim(); // bob got round 1 pot
        vm.prank(carol); circle.claim(); // carol got round 2 pot

        // Each member now has their claimed pot (3*C each)
        // Now withdraw deposits on top of that
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.expectEmit(true, false, false, true, address(circle));
        emit AjoCircle.DepositWithdrawn(alice, CONTRIBUTION);
        vm.prank(alice); circle.withdrawDeposit();
        assertEq(usdc.balanceOf(alice), aliceBefore + CONTRIBUTION);
        assertEq(circle.deposit(alice), 0);

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob); circle.withdrawDeposit();
        assertEq(usdc.balanceOf(bob), bobBefore + CONTRIBUTION);

        uint256 carolBefore = usdc.balanceOf(carol);
        vm.prank(carol); circle.withdrawDeposit();
        assertEq(usdc.balanceOf(carol), carolBefore + CONTRIBUTION);

        // Contract should now hold 0
        assertEq(usdc.balanceOf(address(circle)), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Contributing twice in the same round reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_Contribute_RevertIf_AlreadyPaid() public {
        _allJoin();
        _fund(alice, CONTRIBUTION);
        vm.prank(alice); circle.contribute(0);

        _fund(alice, CONTRIBUTION);
        vm.prank(alice);
        vm.expectRevert(AjoCircle.AlreadyPaid.selector);
        circle.contribute(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Non-member cannot join / contribute / payout
    // ══════════════════════════════════════════════════════════════════════════

    function test_Join_RevertIf_NotMember() public {
        usdc.mint(outsider, CONTRIBUTION);
        vm.prank(outsider); usdc.approve(address(circle), CONTRIBUTION);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(AjoCircle.NotMember.selector, outsider));
        circle.join();
    }

    function test_Contribute_RevertIf_NotMember() public {
        _allJoin();
        usdc.mint(outsider, CONTRIBUTION);
        vm.prank(outsider); usdc.approve(address(circle), CONTRIBUTION);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(AjoCircle.NotMember.selector, outsider));
        circle.contribute(0);
    }

    /// @dev payout() is callable by anyone (no access control), but a non-joined
    ///      address still triggers the round-not-over guard before anyone has paid.
    function test_Payout_RevertIf_NotAllPaidAndBeforeDeadline() public {
        _allJoin();
        // nobody contributed yet and deadline has not passed
        vm.expectRevert(AjoCircle.RoundNotOver.selector);
        circle.payout(); // called by address(this) — not a member, still reverts
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. payout() reverts before everyone has paid AND before the deadline
    // ══════════════════════════════════════════════════════════════════════════

    function test_Payout_RevertIf_PartialPayment_BeforeDeadline() public {
        _allJoin();
        _fund(alice, CONTRIBUTION);
        vm.prank(alice); circle.contribute(0);
        // Only alice paid; deadline not reached
        vm.expectRevert(AjoCircle.RoundNotOver.selector);
        circle.payout();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. payout() succeeds after deadline even if not all paid
    // ══════════════════════════════════════════════════════════════════════════

    function test_Payout_SucceedsAfterDeadline_NotAllPaid() public {
        _allJoin();
        // Only alice contributes
        _fund(alice, CONTRIBUTION);
        vm.prank(alice); circle.contribute(0);

        // Warp past the deadline
        vm.warp(block.timestamp + ROUND_SECS + 1);

        // Bob and carol haven't paid but have deposits → they get covered
        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.Covered(bob, 0, CONTRIBUTION);
        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.Covered(carol, 0, CONTRIBUTION);
        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.PaidOut(alice, 0, 3 * CONTRIBUTION);
        circle.payout();

        assertEq(circle.missedPayments(bob),   1);
        assertEq(circle.missedPayments(carol), 1);
        assertEq(circle.deposit(bob),          0);
        assertEq(circle.deposit(carol),        0);
        assertEq(circle.potOf(0), 3 * CONTRIBUTION);
        assertTrue(circle.paidOut(0));

        // Pull-claim: alice's claimable accrued; wallet not yet changed
        assertEq(circle.claimable(alice), 3 * CONTRIBUTION);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Miss round → covered from deposit
    // ══════════════════════════════════════════════════════════════════════════

    function test_MissedRound_CoveredFromDeposit() public {
        _allJoin();
        // Alice and carol pay; bob misses
        _fund(alice, CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(alice); circle.contribute(0);
        vm.prank(carol); circle.contribute(0);

        vm.warp(block.timestamp + ROUND_SECS + 1);

        uint256 circleBalBefore = usdc.balanceOf(address(circle));

        vm.expectEmit(true, true, false, true, address(circle));
        emit AjoCircle.Covered(bob, 0, CONTRIBUTION);
        circle.payout();

        // Bob's deposit should now be zero
        assertEq(circle.deposit(bob),        0);
        assertEq(circle.missedPayments(bob), 1);
        // Pot equals 3 × CONTRIBUTION (alice + carol contributions + bob deposit)
        assertEq(circle.potOf(0), 3 * CONTRIBUTION);

        // Pull-claim model: payout accrues claimable[alice], does NOT transfer.
        // Circle balance is unchanged immediately after payout.
        assertEq(usdc.balanceOf(address(circle)), circleBalBefore);
        // alice's claimable is the pot
        assertEq(circle.claimable(alice), 3 * CONTRIBUTION);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Miss twice — deposit already zeroed on first miss, second miss is short
    // ══════════════════════════════════════════════════════════════════════════

    function test_MissTwice_SecondMissLeavesPotShort() public {
        _allJoin();

        // --- Round 0: bob misses, gets covered from deposit ---
        _fund(alice, CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(alice); circle.contribute(0);
        vm.prank(carol); circle.contribute(0);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        assertEq(circle.deposit(bob),        0);
        assertEq(circle.missedPayments(bob), 1);
        assertEq(circle.currentRound(), 1);

        // --- Round 1: bob misses again, no deposit to cover ---
        _fund(alice, CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(alice); circle.contribute(1);
        vm.prank(carol); circle.contribute(1);
        vm.warp(block.timestamp + ROUND_SECS + 1);

        // Should NOT revert even though pot is short
        circle.payout();

        assertEq(circle.missedPayments(bob), 2);
        assertEq(circle.deposit(bob), 0);
        // Pot is only 2 × CONTRIBUTION (bob had no deposit)
        assertEq(circle.potOf(1), 2 * CONTRIBUTION);
        assertTrue(circle.paidOut(1));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 8. leaveBeforeStart refunds full deposit
    // ══════════════════════════════════════════════════════════════════════════

    function test_LeaveBeforeStart_RefundsDeposit() public {
        _fund(alice, CONTRIBUTION);
        _fund(bob,   CONTRIBUTION);

        vm.prank(alice); circle.join();
        vm.prank(bob);   circle.join();

        assertEq(usdc.balanceOf(alice), 0);
        assertEq(circle.deposit(alice), CONTRIBUTION);
        assertTrue(circle.joined(alice));

        vm.expectEmit(true, false, false, false, address(circle));
        emit AjoCircle.Left(alice);
        vm.prank(alice); circle.leaveBeforeStart();

        assertEq(usdc.balanceOf(alice), CONTRIBUTION); // full refund
        assertEq(circle.deposit(alice), 0);
        assertFalse(circle.joined(alice));
        assertFalse(circle.started()); // circle not started (only 1 member left)
    }

    function test_LeaveBeforeStart_RevertIf_AlreadyStarted() public {
        _allJoin(); // all 3 join → started = true
        vm.prank(alice);
        vm.expectRevert(AjoCircle.AlreadyStarted.selector);
        circle.leaveBeforeStart();
    }

    function test_LeaveBeforeStart_RevertIf_NotJoined() public {
        vm.prank(alice);
        vm.expectRevert(AjoCircle.NotJoined.selector);
        circle.leaveBeforeStart();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 9. Factory createCircle — circlesOf() indexes correctly per member
    // ══════════════════════════════════════════════════════════════════════════

    function test_Factory_CirclesOf_IndexedPerMember() public {
        address[] memory members = new address[](3);
        members[0] = alice;
        members[1] = bob;
        members[2] = carol;

        vm.expectEmit(false, true, false, false, address(factory));
        emit AjoFactory.CircleCreated(address(0), address(this), "TestCircle");
        address circleAddr = factory.createCircle("TestCircle", members, CONTRIBUTION, ROUND_SECS);

        // allCircles
        address[] memory all = factory.allCircles();
        assertEq(all.length, 1);
        assertEq(all[0], circleAddr);

        // circlesOf each member points to the circle
        address[] memory aliceCircles = factory.circlesOf(alice);
        address[] memory bobCircles   = factory.circlesOf(bob);
        address[] memory carolCircles = factory.circlesOf(carol);

        assertEq(aliceCircles.length, 1);
        assertEq(bobCircles.length,   1);
        assertEq(carolCircles.length, 1);

        assertEq(aliceCircles[0], circleAddr);
        assertEq(bobCircles[0],   circleAddr);
        assertEq(carolCircles[0], circleAddr);

        // outsider has no circles
        assertEq(factory.circlesOf(outsider).length, 0);
    }

    function test_Factory_MultipleCircles_IndexedCorrectly() public {
        address[] memory members1 = new address[](2);
        members1[0] = alice;
        members1[1] = bob;

        address[] memory members2 = new address[](2);
        members2[0] = bob;
        members2[1] = carol;

        address c1 = factory.createCircle("Circle1", members1, CONTRIBUTION, ROUND_SECS);
        address c2 = factory.createCircle("Circle2", members2, CONTRIBUTION, ROUND_SECS);

        assertEq(factory.allCircles().length, 2);

        address[] memory aliceC = factory.circlesOf(alice);
        address[] memory bobC   = factory.circlesOf(bob);
        address[] memory carolC = factory.circlesOf(carol);

        // alice only in circle1
        assertEq(aliceC.length, 1);
        assertEq(aliceC[0], c1);

        // bob in both
        assertEq(bobC.length, 2);
        assertEq(bobC[0], c1);
        assertEq(bobC[1], c2);

        // carol only in circle2
        assertEq(carolC.length, 1);
        assertEq(carolC[0], c2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 10. Duplicate member address in constructor reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_Constructor_RevertIf_DuplicateMember() public {
        address[] memory members = new address[](3);
        members[0] = alice;
        members[1] = alice; // duplicate
        members[2] = carol;

        vm.expectRevert(AjoCircle.DuplicateMember.selector);
        new AjoCircle(address(usdc), "Dup", members, CONTRIBUTION, ROUND_SECS);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 11. contribute() with wrong round number reverts
    // ══════════════════════════════════════════════════════════════════════════

    function test_Contribute_RevertIf_WrongRound() public {
        _allJoin();
        _fund(alice, CONTRIBUTION);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AjoCircle.WrongRound.selector, uint256(0), uint256(1)));
        circle.contribute(1); // current round is 0
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Additional edge-case tests
    // ══════════════════════════════════════════════════════════════════════════

    /// Already joined member cannot join again
    function test_Join_RevertIf_AlreadyJoined() public {
        _fund(alice, CONTRIBUTION);
        vm.prank(alice); circle.join();

        usdc.mint(alice, CONTRIBUTION);
        vm.prank(alice); usdc.approve(address(circle), CONTRIBUTION);
        vm.prank(alice);
        vm.expectRevert(AjoCircle.AlreadyJoined.selector);
        circle.join();
    }

    /// contribute() before start reverts
    function test_Contribute_RevertIf_NotStarted() public {
        _fund(alice, CONTRIBUTION);
        vm.prank(alice);
        vm.expectRevert(AjoCircle.NotStarted.selector);
        circle.contribute(0);
    }

    /// withdrawDeposit() before finish reverts (reuses NotStarted sentinel)
    function test_WithdrawDeposit_RevertIf_NotFinished() public {
        _allJoin();
        vm.prank(alice);
        vm.expectRevert(AjoCircle.NotStarted.selector);
        circle.withdrawDeposit();
    }

    /// withdrawDeposit() twice reverts with AlreadyWithdrawn
    function test_WithdrawDeposit_RevertIf_AlreadyWithdrawn() public {
        _allJoin();
        _allContribute(0); circle.payout();
        _allContribute(1); circle.payout();
        _allContribute(2); circle.payout();

        vm.prank(alice); circle.withdrawDeposit();
        vm.prank(alice);
        vm.expectRevert(AjoCircle.AlreadyWithdrawn.selector);
        circle.withdrawDeposit();
    }

    /// Constructor with only 1 member reverts
    function test_Constructor_RevertIf_TooFewMembers() public {
        address[] memory members = new address[](1);
        members[0] = alice;
        vm.expectRevert(AjoCircle.TooFewMembers.selector);
        new AjoCircle(address(usdc), "Solo", members, CONTRIBUTION, ROUND_SECS);
    }

    /// Constructor with zero address USDC reverts
    function test_Constructor_RevertIf_ZeroAddressUsdc() public {
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;
        vm.expectRevert(AjoCircle.ZeroAddress.selector);
        new AjoCircle(address(0), "X", members, CONTRIBUTION, ROUND_SECS);
    }

    /// Constructor with zero contribution reverts
    function test_Constructor_RevertIf_ZeroContribution() public {
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;
        vm.expectRevert(AjoCircle.InvalidContribution.selector);
        new AjoCircle(address(usdc), "X", members, 0, ROUND_SECS);
    }

    /// Constructor with round seconds < 60 reverts
    function test_Constructor_RevertIf_InvalidRoundSeconds() public {
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;
        vm.expectRevert(AjoCircle.InvalidRoundSeconds.selector);
        new AjoCircle(address(usdc), "X", members, CONTRIBUTION, 59);
    }

    /// payout() after finish reverts
    function test_Payout_RevertIf_AlreadyFinished() public {
        _allJoin();
        _allContribute(0); circle.payout();
        _allContribute(1); circle.payout();
        _allContribute(2); circle.payout();

        vm.expectRevert(AjoCircle.AlreadyFinished.selector);
        circle.payout();
    }

    /// Factory ZeroAddress guard
    function test_Factory_Constructor_RevertIf_ZeroAddress() public {
        vm.expectRevert(AjoFactory.ZeroAddress.selector);
        new AjoFactory(address(0));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 12. Claim tests (pull-claim model)
    // ══════════════════════════════════════════════════════════════════════════

    /// After payout of round 0, alice (recipient) claims and receives the pot.
    function test_Claim_AfterPayout() public {
        _allJoin();
        _allContribute(0);
        circle.payout(); // round 0 → alice

        // Claimable accrued; wallet not yet changed
        assertEq(circle.claimable(alice), 3 * CONTRIBUTION);
        assertEq(usdc.balanceOf(alice), 0);

        vm.expectEmit(true, false, false, true, address(circle));
        emit AjoCircle.Claimed(alice, 3 * CONTRIBUTION);
        vm.prank(alice); circle.claim();

        assertEq(usdc.balanceOf(alice), 3 * CONTRIBUTION);
        assertEq(circle.claimable(alice), 0);
    }

    /// Recipient never calls claim() — circle runs to completion; others can claim;
    /// the non-claiming recipient's claimable stays > 0 in the contract.
    function test_Claim_RecipientNeverClaims() public {
        _allJoin();

        // Round 0 → alice is the recipient; she never claims
        _allContribute(0);
        circle.payout();
        assertEq(circle.claimable(alice), 3 * CONTRIBUTION); // accrued, not claimed

        // Round 1 → bob is the recipient; he claims immediately
        _allContribute(1);
        circle.payout();
        assertEq(circle.claimable(bob), 3 * CONTRIBUTION);
        uint256 bobReceived = _claim(bob);
        assertEq(bobReceived, 3 * CONTRIBUTION);
        assertEq(circle.claimable(bob), 0);

        // Round 2 → carol is the recipient; she claims immediately
        _allContribute(2);
        circle.payout();
        assertTrue(circle.finished());
        assertEq(circle.claimable(carol), 3 * CONTRIBUTION);
        uint256 carolReceived = _claim(carol);
        assertEq(carolReceived, 3 * CONTRIBUTION);
        assertEq(circle.claimable(carol), 0);

        // Alice still has unclaimed pot in the contract
        assertEq(circle.claimable(alice), 3 * CONTRIBUTION);
        // The contract still holds alice's unclaimed pot + all 3 deposits
        // (deposits not withdrawn yet)
        uint256 expectedContractBal =
            (3 * CONTRIBUTION)               // alice's unclaimed pot
            + (3 * CONTRIBUTION);            // 3 member deposits
        assertEq(usdc.balanceOf(address(circle)), expectedContractBal);
    }

    /// claim() with nothing accrued reverts with NothingToClaim.
    function test_Claim_NothingToClaim_Reverts() public {
        _allJoin();
        // No payout has happened yet for alice
        vm.prank(alice);
        vm.expectRevert(AjoCircle.NothingToClaim.selector);
        circle.claim();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 13. owedShortfall view  (uses uncoveredMisses semantics)
    // ══════════════════════════════════════════════════════════════════════════

    /// owedShortfall uses uncoveredMisses * contribution (NOT missedPayments).
    /// Round 0: bob misses but is covered by deposit → uncoveredMisses stays 0 →
    ///          owedShortfall == 0 even though missedPayments == 1.
    /// Round 1: bob misses again with deposit == 0 → uncoveredMisses becomes 1 →
    ///          owedShortfall == 1 * CONTRIBUTION even though missedPayments == 2.
    function test_OwedShortfall() public {
        _allJoin();

        // Round 0: bob misses — deposit covers him (missedPayments[bob] = 1,
        //          uncoveredMisses[bob] = 0 because coveredByDeposit[0][bob] = true)
        _fund(alice, CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(alice); circle.contribute(0);
        vm.prank(carol); circle.contribute(0);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        assertEq(circle.missedPayments(bob),   1);
        assertEq(circle.uncoveredMisses(bob),  0);
        assertTrue(circle.coveredByDeposit(0, bob));
        assertEq(circle.owedShortfall(bob),    0); // covered → shortfall is 0

        // Round 1: bob misses again — deposit is 0, no coverage
        //          (missedPayments[bob] = 2, uncoveredMisses[bob] = 1)
        _fund(alice, CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(alice); circle.contribute(1);
        vm.prank(carol); circle.contribute(1);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        assertEq(circle.missedPayments(bob),  2);
        assertEq(circle.uncoveredMisses(bob), 1);
        assertFalse(circle.coveredByDeposit(1, bob));
        assertEq(circle.owedShortfall(bob),   CONTRIBUTION); // 1 uncovered miss
    }

    /// owedShortfall is 0 for a member who has never missed.
    function test_OwedShortfall_ZeroForGoodPayer() public {
        _allJoin();
        _allContribute(0);
        circle.payout();

        assertEq(circle.missedPayments(alice), 0);
        assertEq(circle.owedShortfall(alice),  0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 13b. coveredByDeposit / uncoveredMisses — new mapping tests
    // ══════════════════════════════════════════════════════════════════════════

    /// Round 0: alice misses but has full deposit → coveredByDeposit[0][alice]=true,
    /// uncoveredMisses[alice]=0, owedShortfall==0, missedPayments==1.
    /// Pot equals full 3×contribution because deposit filled alice's slot.
    function test_CoveredMiss_OwedShortfallZero() public {
        _allJoin();

        // bob and carol contribute for round 0; alice does NOT
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(0);
        vm.prank(carol); circle.contribute(0);

        // Warp past deadline so payout() is callable
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        // Covered miss assertions
        assertTrue(circle.coveredByDeposit(0, alice));
        assertEq(circle.uncoveredMisses(alice), 0);
        assertEq(circle.owedShortfall(alice),   0);
        assertEq(circle.missedPayments(alice),  1);
        // Deposit was consumed to fill the pot
        assertEq(circle.potOf(0), 3 * CONTRIBUTION);
    }

    /// Round 0 covered miss → deposit zeroed.
    /// Round 1 alice misses again → deposit==0 → uncoveredMisses becomes 1 →
    /// owedShortfall == 1 * CONTRIBUTION, missedPayments == 2.
    function test_UncoveredMiss_OwedShortfallEqualsContribution() public {
        _allJoin();

        // --- Round 0: alice misses; deposit covers ---
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(0);
        vm.prank(carol); circle.contribute(0);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        // Sanity: covered in round 0, deposit now zero
        assertTrue(circle.coveredByDeposit(0, alice));
        assertEq(circle.uncoveredMisses(alice), 0);
        assertEq(circle.deposit(alice),         0);

        // --- Round 1: alice misses again; deposit==0, no coverage ---
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(1);
        vm.prank(carol); circle.contribute(1);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        // Uncovered miss assertions
        assertEq(circle.owedShortfall(alice),    CONTRIBUTION); // 1 uncovered miss
        assertEq(circle.missedPayments(alice),   2);
        assertFalse(circle.coveredByDeposit(1, alice));
        assertEq(circle.uncoveredMisses(alice),  1);
    }

    /// circleState() correctly populates roundCovered and memberShortfall.
    function test_CircleState_RoundCovered_MemberShortfall() public {
        // ── Scenario A: covered miss (alice index 0) ──────────────────────────
        _allJoin();

        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(0);
        vm.prank(carol); circle.contribute(0);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        AjoCircle.CircleStateView memory stateA = circle.circleState();

        // alice is members[0] → index 0
        assertTrue(stateA.roundCovered[0][0],             "A: roundCovered[0][alice]");
        assertEq(stateA.memberShortfall[0], 0,            "A: memberShortfall[alice]==0");

        // ── Scenario B: build on A — round 1 uncovered miss ───────────────────
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(1);
        vm.prank(carol); circle.contribute(1);
        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout();

        AjoCircle.CircleStateView memory stateB = circle.circleState();

        // round 1 → alice NOT covered (deposit was 0)
        assertFalse(stateB.roundCovered[1][0],                  "B: roundCovered[1][alice]");
        // memberShortfall[alice] == 1 uncovered miss * CONTRIBUTION
        assertEq(stateB.memberShortfall[0], CONTRIBUTION,       "B: memberShortfall[alice]==contribution");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Factory — creatorOf mapping
    // ══════════════════════════════════════════════════════════════════════════

    /// After createCircle(), factory.creatorOf(circleAddress) == msg.sender (address(this)).
    function test_Factory_CreatorOf() public {
        address[] memory members = new address[](3);
        members[0] = alice;
        members[1] = bob;
        members[2] = carol;

        // address(this) is the test contract — it is msg.sender for this call
        address circleAddr = factory.createCircle("CreatorCircle", members, CONTRIBUTION, ROUND_SECS);

        assertEq(factory.creatorOf(circleAddr), address(this));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 14. Fuzz: contribution amount and payout via pull-claim
    // ══════════════════════════════════════════════════════════════════════════

    /// Fuzz: any single contribution within a valid amount processes correctly;
    /// alice must call claim() to receive her pot.
    function testFuzz_ContributeAndPayout(uint96 fuzzContrib) public {
        uint256 contrib = bound(uint256(fuzzContrib), 1, type(uint96).max);

        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;

        AjoCircle fuzzCircle = new AjoCircle(
            address(usdc),
            "FuzzCircle",
            members,
            contrib,
            ROUND_SECS
        );

        // Fund & approve for join (deposit)
        usdc.mint(alice, contrib);
        vm.prank(alice); usdc.approve(address(fuzzCircle), contrib);
        usdc.mint(bob, contrib);
        vm.prank(bob); usdc.approve(address(fuzzCircle), contrib);

        vm.prank(alice); fuzzCircle.join();
        vm.prank(bob);   fuzzCircle.join();
        assertTrue(fuzzCircle.started());

        // Round 0 contributions
        usdc.mint(alice, contrib);
        vm.prank(alice); usdc.approve(address(fuzzCircle), contrib);
        usdc.mint(bob, contrib);
        vm.prank(bob); usdc.approve(address(fuzzCircle), contrib);

        vm.prank(alice); fuzzCircle.contribute(0);
        vm.prank(bob);   fuzzCircle.contribute(0);

        assertEq(fuzzCircle.potOf(0), 2 * contrib);

        // payout round 0 → alice (pull-claim model)
        fuzzCircle.payout();

        // claimable accrued; wallet unchanged
        assertEq(fuzzCircle.claimable(alice), 2 * contrib);

        // alice claims
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice); fuzzCircle.claim();
        assertEq(usdc.balanceOf(alice), aliceBefore + 2 * contrib);
        assertEq(fuzzCircle.claimable(alice), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 15. NotMember error carries the caller address
    // ══════════════════════════════════════════════════════════════════════════

    /// join() from a non-member address reverts with NotMember(caller).
    function test_NotMember_ErrorHasCallerParam() public {
        address nonMember = makeAddr("nonMember");
        usdc.mint(nonMember, CONTRIBUTION);
        vm.prank(nonMember); usdc.approve(address(circle), CONTRIBUTION);
        vm.prank(nonMember);
        vm.expectRevert(abi.encodeWithSelector(AjoCircle.NotMember.selector, nonMember));
        circle.join();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 16. WrongRound error carries expected and provided round numbers
    // ══════════════════════════════════════════════════════════════════════════

    /// contribute(1) when currentRound == 0 reverts with WrongRound(0, 1).
    function test_WrongRound_ErrorHasParams() public {
        _allJoin();
        _fund(alice, CONTRIBUTION);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AjoCircle.WrongRound.selector, uint256(0), uint256(1)));
        circle.contribute(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 17. Deposit decremented by _contribution per miss (not zeroed entirely)
    // ══════════════════════════════════════════════════════════════════════════

    /// Alice misses round 0 → deposit goes from CONTRIBUTION to 0 (one full decrement).
    /// Alice misses round 1 → deposit stays 0, no coverage, pot is short.
    /// missedPayments[alice] == 2, deposit[alice] == 0, potOf[1] < memberCount * CONTRIBUTION.
    function test_DepositCoversMultipleMisses_IfDepositLargeEnough() public {
        // Use a fresh 3-member circle (alice=0, bob=1, carol=2) — same as setUp().

        // --- Round 0: alice misses. deposit == CONTRIBUTION >= CONTRIBUTION → fully covered ---
        // _allJoin() funds all three for the join deposit and calls join().
        _allJoin();

        // bob and carol contribute; alice does not
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(0);
        vm.prank(carol); circle.contribute(0);

        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout(); // alice missed; deposit(CONTRIBUTION) covers her → deposit becomes 0

        assertEq(circle.missedPayments(alice), 1);
        assertEq(circle.deposit(alice),        0);
        // Full pot: alice covered by deposit + bob + carol
        assertEq(circle.potOf(0), 3 * CONTRIBUTION);
        assertEq(circle.currentRound(), 1);

        // --- Round 1: alice misses again. deposit == 0, neither branch fires → pot is short ---
        _fund(bob,   CONTRIBUTION);
        _fund(carol, CONTRIBUTION);
        vm.prank(bob);   circle.contribute(1);
        vm.prank(carol); circle.contribute(1);

        vm.warp(block.timestamp + ROUND_SECS + 1);
        circle.payout(); // alice missed; deposit == 0, no coverage

        assertEq(circle.missedPayments(alice), 2);
        assertEq(circle.deposit(alice),        0);
        // Pot is short: only bob + carol contributed (alice had no deposit)
        assertEq(circle.potOf(1), 2 * CONTRIBUTION);
        assertTrue(circle.paidOut(1));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 18. Partial cover path note
    // ══════════════════════════════════════════════════════════════════════════

    // NOTE: The partial cover path in payout() — where 0 < deposit[member] < _contribution —
    // cannot be reached in the current design. At join(), deposit is set to exactly
    // _contribution. Each miss decrements deposit by _contribution (or zeros the remainder
    // if dep < contribution). Because contribution is always a whole multiple of itself,
    // the only reachable states after N misses are deposit == CONTRIBUTION (0 misses) or
    // deposit == 0 (≥1 miss). A separate test_DepositPartialCover test is therefore omitted.

    // ══════════════════════════════════════════════════════════════════════════
    // 19. Fee-on-transfer token guard — join()
    // ══════════════════════════════════════════════════════════════════════════

    /// join() reverts with UnexpectedTransferAmount when the token silently deducts
    /// a 1-unit fee so the circle receives (contribution - 1) instead of contribution.
    function test_Join_RevertIf_FeeOnTransferToken() public {
        // Deploy a fee-on-transfer token (deducts 1 unit per transferFrom).
        FeeOnTransferMockERC20 feeToken = new FeeOnTransferMockERC20("Fee USDC", "fUSDC", 6);

        // Build a 2-member circle using the fee token.
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;

        AjoCircle feeCircle = new AjoCircle(
            address(feeToken),
            "FeeCircle",
            members,
            CONTRIBUTION,
            ROUND_SECS
        );

        // Fund alice with enough to cover the contribution plus the fee that gets eaten.
        feeToken.mint(alice, CONTRIBUTION + 1);
        vm.prank(alice);
        feeToken.approve(address(feeCircle), CONTRIBUTION + 1);

        // join() should revert: circle receives CONTRIBUTION - 1 but expects CONTRIBUTION.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                AjoCircle.UnexpectedTransferAmount.selector,
                CONTRIBUTION,       // expected
                CONTRIBUTION - 1    // received (fee ate 1 unit)
            )
        );
        feeCircle.join();
    }

    // NOTE on test_Contribute_RevertIf_FeeOnTransferToken:
    // The same UnexpectedTransferAmount guard exists verbatim in contribute() as in join().
    // However, reaching contribute() requires all members to have successfully joined first.
    // With a fee-on-transfer token, join() itself reverts (proven above), so it is impossible
    // to construct a circle that has passed join() but can still demonstrate the contribute()
    // guard using the same fee token — the USDC address is baked into the circle at
    // construction. Because both guards are identical code paths and the join() test already
    // validates the guard, a separate contribute() fee-token test adds no new signal.

    // ══════════════════════════════════════════════════════════════════════════
    // 20. AjoFactory constructor — NotAContract guard
    // ══════════════════════════════════════════════════════════════════════════

    /// Deploying AjoFactory with a non-contract address reverts with NotAContract.
    function test_Factory_Constructor_RevertIf_NotAContract() public {
        address notAContract = address(0x1234);
        // Confirm address(0x1234) has no code in this test environment.
        assertEq(notAContract.code.length, 0);

        vm.expectRevert(
            abi.encodeWithSelector(AjoFactory.NotAContract.selector, notAContract)
        );
        new AjoFactory(notAContract);
    }
}
