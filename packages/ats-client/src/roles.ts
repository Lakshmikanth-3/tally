import { Role, RoleRequest } from '@hashgraph/asset-tokenization-sdk';

/// Grants a real ATS security role, guarded by a real hasRole check.
///
/// [VERIFIED via a real failed attempt] Role.grantRole reverts with the
/// real custom error AccountAssignedToRole(bytes32,address) when the
/// target already holds the role — calling it unconditionally isn't safe
/// for a function that may run more than once against the same diamond
/// (e.g. a redemption retried after a partial earlier failure).
export async function ensureRoleGranted(securityId: string, targetEvmAddress: string, role: string): Promise<void> {
  const alreadyGranted = await Role.hasRole(
    new RoleRequest({ securityId, targetId: targetEvmAddress, role }),
  );
  if (alreadyGranted) return;

  await Role.grantRole(new RoleRequest({ securityId, targetId: targetEvmAddress, role }));
}
