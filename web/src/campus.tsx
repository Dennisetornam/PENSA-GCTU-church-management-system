import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface CampusFeatures {
  pickupPoints: boolean;
  pdp: boolean;
  helpDesk: boolean;
  noDepartmentOption: boolean;
  hostelPicker: boolean;
}
export interface Campus {
  id: string;
  name: string;
  shortName: string;
  features: CampusFeatures;
}

const DEFAULT: Campus = {
  id: "gctu",
  name: "PENSA",
  shortName: "",
  features: { pickupPoints: false, pdp: false, helpDesk: false, noDepartmentOption: false, hostelPicker: false },
};

const CampusCtx = createContext<Campus>(DEFAULT);

export function CampusProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ campus: Campus }>("/config"),
    staleTime: Infinity,
  });
  return <CampusCtx.Provider value={data?.campus ?? DEFAULT}>{children}</CampusCtx.Provider>;
}

export const useCampus = () => useContext(CampusCtx);
