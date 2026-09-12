import type { HawalaPartnerRecord } from "../../lib/financialApi";

export function isHawalaEndpointReady(partner: HawalaPartnerRecord) {
  return Boolean(
    partner.endpoint_active && partner.endpoint_verified_at && partner.endpoint_type
    && partner.recipient_organization_id && partner.recipient_branch_id
    && (partner.endpoint_type === "internal_branch" || partner.reciprocal_partner_id),
  );
}
