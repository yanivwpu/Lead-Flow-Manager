import { SolutionPage } from "@/components/marketing/SolutionPage";
import {
  ecommerceSolution,
  localServiceSolution,
  marketingAgenciesSolution,
  medSpasSolution,
  realEstateSolution,
} from "@shared/solutionPages";

export function RealEstateSolutionPage() {
  return <SolutionPage content={realEstateSolution} />;
}

export function EcommerceSolutionPage() {
  return <SolutionPage content={ecommerceSolution} />;
}

export function LocalServiceSolutionPage() {
  return <SolutionPage content={localServiceSolution} />;
}

export function MarketingAgenciesSolutionPage() {
  return <SolutionPage content={marketingAgenciesSolution} />;
}

export function MedSpasSolutionPage() {
  return <SolutionPage content={medSpasSolution} />;
}
