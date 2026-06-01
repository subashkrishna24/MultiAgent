export function needsConfirmation(toolPlan) {

  const riskyTools = [
    "captureform",
    "createCampaignGroup",
    "sendCampaign",
    "deleteCampaign",
    "createCaptureForm",
    "updateAudience",
    "scheduleCampaign"
  ];

  if (toolPlan.requiresConfirmation) return true;

  return riskyTools.includes(toolPlan.tool);
}