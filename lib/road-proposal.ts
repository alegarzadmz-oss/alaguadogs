import { mapsRoutePlan } from "./maps-plan";
import { computeMapsRoute } from "./google-maps";
import { routeSource } from "./saved-routes";
import { storeRoadProposal } from "@/db/saved-routes";
import type { PlanningContext } from "./akira";
import type { TeamMember } from "./team";

export async function proposeRoadRoute(
  member: TeamMember,
  ctx: Pick<PlanningContext, "state" | "history">,
  date: string,
  vanId: string,
) {
  const source = routeSource(ctx.state, ctx.history, date, vanId);
  const result = await computeMapsRoute(
    member,
    mapsRoutePlan(ctx.state, ctx.history, date, vanId),
  );
  const savedRoute = await storeRoadProposal(
    member,
    source,
    result.stops.map((s) => s.id),
  );
  return {
    ...result,
    savedRoute,
    draftSaved: true,
    saved: false,
    saveMeaning:
      "Propuesta guardada en la ficha de la VAN. No se publicaron asignaciones ni se modificaron horarios o pagos.",
  };
}
