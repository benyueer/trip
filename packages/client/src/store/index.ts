import { create } from 'zustand'

interface MapStore {
  aMap: any
  setAMap: (aMap: any) => void
}

export const useMapStore = create<MapStore>((set) => ({
  aMap: null,
  setAMap: (aMap: any) => set({ aMap }),
}))
