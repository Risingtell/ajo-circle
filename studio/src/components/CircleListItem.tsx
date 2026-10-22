/**
 * Wrapper that resolves whether the wallet has joined a circle and
 * renders either CircleCard (joined or creator) or InvitationCard (not yet joined).
 */
import React from 'react';
import { CircleCard } from './CircleCard';
import { InvitationCard } from './InvitationCard';
import { useCircleJoined, useCircleCreator } from '../hooks/useCircleState';

interface Props {
  address: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId: number;
  factoryAddress: `0x${string}`;
  onClick: () => void;
}

export function CircleListItem({ address, walletAddress, chainId, factoryAddress, onClick }: Props) {
  const hasJoined = useCircleJoined(address, walletAddress, chainId);
  const creator = useCircleCreator(factoryAddress, address, chainId);
  const isCreator = creator?.toLowerCase() === walletAddress.toLowerCase();

  if (hasJoined || isCreator) {
    return <CircleCard address={address} chainId={chainId} onClick={onClick} />;
  }

  return (
    <InvitationCard
      address={address}
      chainId={chainId}
      creator={creator}
      onClick={onClick}
    />
  );
}
