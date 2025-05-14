interface LngLat {
  lng: number
  lat: number
}

export interface Poi {
  name: string
  position: LngLat
  description: string
  playCostHours: number
}

interface Step {
  path: LngLat[]
}

interface DriveRoute {
  start: Poi
  end: Poi
  costHours: number
  steps: Step[]
}

export const pois: Poi[] = [
  {
    name: '杭州',
    position: {
      lat: 30.285844,
      lng: 120.002835,
    },
    description: '出发地',
    playCostHours: 0,
  },
  {
    name: '西安',
    position: {
      lat: 34.280249,
      lng: 108.962026,
    },
    description: '途径',
    playCostHours: 0,
  },
  {
    name: '乌鲁木齐',
    position: {
      lat: 43.839424,
      lng: 87.527372,
    },
    description: '途径',
    playCostHours: 0,
  },
  {
    name: '伊宁',
    position: {
      lat: 43.966045,
      lng: 81.276563,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '赛里木',
    position: {
      lat: 44.606089,
      lng: 81.383705,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '松树头',
    position: {
      lat: 44.503513,
      lng: 81.143785,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '果子沟大桥',
    position: {
      lat: 44.475783,
      lng: 81.135361,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '博乐',
    position: {
      lat: 44.853529,
      lng: 82.046209,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '喀拉峻',
    position: {
      lat: 43.058699,
      lng: 82.133455,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '库琼什台',
    position: {
      lat: 42.954472,
      lng: 82.21906,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '恰西',
    position: {
      lat: 43.064232,
      lng: 82.701441,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '库尔德宁',
    position: {
      lat: 43.28445,
      lng: 82.67493,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '那拉提',
    position: {
      lat: 43.232955,
      lng: 84.039764,
    },
    description: '',
    playCostHours: 0,
  },
  {
    name: '夏塔',
    position: {
      lat: 42.577856,
      lng: 80.710554,
    },
    description: '',
    playCostHours: 0,
  },
]


export const lines: DriveRoute[] = [

]


