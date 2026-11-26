export function buildRegisterDeviceSessionArgs({ deviceId, deviceSecret, label, userAgent }) {
  return {
    p_device_id: deviceId,
    p_device_secret: deviceSecret,
    p_label: label,
    p_user_agent: userAgent,
  };
}

export function buildDeviceSessionAdminArgs(action, { target, justification, ticketReference = "" }) {
  if (action === "admin_revoke_session") {
    return { p_session_id: target, p_justification: justification };
  }
  if (action === "admin_approve_device") {
    return {
      p_device_id: target,
      p_justification: justification,
      p_ticket_reference: ticketReference,
    };
  }
  return { p_device_id: target, p_justification: justification };
}

export function buildListDeviceSessionsArgs({ userId = null, justification }) {
  return { p_user_id: userId, p_justification: justification };
}
