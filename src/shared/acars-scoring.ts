// Ported verbatim from the web portal's src/lib/acars-scoring.ts so the
// pre-submission summary shown here matches what the portal recomputes
// (from the same raw metric fields) at PIREP approval time.

export const ACARS_RULES = {
  baseFlightPoints: 100,
  maxTaxiSpeedKt: 30,
  taxiOverspeedPenalty: 15,
  maxLandingDistanceFt: 3000,
  longLandingPenalty: 20,
  fuelReservePenalty: 25,
};

export interface AcarsDeduction {
  code: string;
  label: string;
  points: number;
}

export interface AcarsFlightMetrics {
  maxTaxiSpeedKt: number;
  landingDistanceFromThresholdFt: number;
  fuelRemainingAtLandingKg: number;
  requiredReserveKg: number;
}

export function computeAcarsDeductions(
  metrics: AcarsFlightMetrics
): { pointsAwarded: number; deductions: AcarsDeduction[] } {
  const deductions: AcarsDeduction[] = [];

  if (metrics.maxTaxiSpeedKt > ACARS_RULES.maxTaxiSpeedKt) {
    deductions.push({
      code: "TAXI_OVERSPEED",
      label: `Taxi speed ${metrics.maxTaxiSpeedKt}kt exceeded the ${ACARS_RULES.maxTaxiSpeedKt}kt limit`,
      points: ACARS_RULES.taxiOverspeedPenalty,
    });
  }

  if (metrics.landingDistanceFromThresholdFt > ACARS_RULES.maxLandingDistanceFt) {
    deductions.push({
      code: "LONG_LANDING",
      label: `Touchdown ${metrics.landingDistanceFromThresholdFt}ft from the threshold exceeded the ${ACARS_RULES.maxLandingDistanceFt}ft limit`,
      points: ACARS_RULES.longLandingPenalty,
    });
  }

  if (metrics.fuelRemainingAtLandingKg < metrics.requiredReserveKg) {
    deductions.push({
      code: "FUEL_RESERVE_BREACH",
      label: `Landed with ${metrics.fuelRemainingAtLandingKg}kg fuel, below the ${metrics.requiredReserveKg}kg required reserve`,
      points: ACARS_RULES.fuelReservePenalty,
    });
  }

  const totalDeducted = deductions.reduce((sum, d) => sum + d.points, 0);
  const pointsAwarded = Math.max(0, ACARS_RULES.baseFlightPoints - totalDeducted);

  return { pointsAwarded, deductions };
}
