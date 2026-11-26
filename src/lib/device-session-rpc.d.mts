export type DeviceSessionAdminRpc = "admin_approve_device" | "admin_revoke_device" | "admin_revoke_session";

export function buildRegisterDeviceSessionArgs(input: {
  deviceId: string;
  deviceSecret: string;
  label: string;
  userAgent: string | null;
}): {
  p_device_id: string;
  p_device_secret: string;
  p_label: string;
  p_user_agent: string | null;
};

export function buildDeviceSessionAdminArgs(
  action: "admin_approve_device",
  input: { target: string; justification: string; ticketReference: string },
): { p_device_id: string; p_justification: string; p_ticket_reference: string };
export function buildDeviceSessionAdminArgs(
  action: "admin_revoke_device",
  input: { target: string; justification: string },
): { p_device_id: string; p_justification: string };
export function buildDeviceSessionAdminArgs(
  action: "admin_revoke_session",
  input: { target: string; justification: string },
): { p_session_id: string; p_justification: string };
export function buildDeviceSessionAdminArgs(
  action: DeviceSessionAdminRpc,
  input: { target: string; justification: string; ticketReference?: string },
): { p_device_id: string; p_justification: string; p_ticket_reference: string }
  | { p_device_id: string; p_justification: string }
  | { p_session_id: string; p_justification: string };

export function buildListDeviceSessionsArgs(input: {
  userId?: string | null;
  justification: string;
}): { p_user_id: string | null; p_justification: string };
