import {
  Ref,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import styles from './styles.module.less'
import { useMapStore } from '../../store'

interface MapProps {
  showSearch?: boolean
}

export const AMap = forwardRef((_props: MapProps, ref: Ref<any>) => {
  const [searchResult, setSearchResult] = useState([])
  const mapRef = useRef(null)
  const drivingRef = useRef(null)

  const setAMap = useMapStore((store) => store.setAMap)

  const mapInit = async () => {
    window._AMapSecurityConfig = {
      securityJsCode: '1a3840dc75f97d1518724bf76a3e9f50',
    }
    const AMap = await window.AMapLoader.load({
      key: '352f9c4a914c78688cd57ad17f06807f',
      version: '2.0',
      plugins: ['AMap.PlaceSearch', 'AMap.Driving', 'AMap.Marker', 'AMap.Geocoder'],
    })
    const map = new window.AMap.Map('map_container', {
      // mapStyle: 'amap://styles/macaron',
    })
    mapRef.current = map

    drivingRef.current = new AMap.Driving({
      map: mapRef.current,
    })

    initEnent()
    initInstance(window.AMap)
  }

  const initInstance = (AMap) => {
    setAMap({
      searchPlace: (pName) => {
        const placeSearch = new AMap.PlaceSearch({
          pageSize: 20,
          pageIndex: 1,
          citylimit: false,
          map: mapRef.current, // 展现结果的地图实例
          panel: 'panel',
          autoFitView: true,
        })
        placeSearch.search(pName, (status, result) => {
          // console.log(status, result)
          // if (status === 'complete' && result.info === 'OK') {
          //   setSearchResult(result.poiList.pois)
          // }
        })
      },
      addEventHandler: (eventName, callback) => {
        mapRef.current.on(eventName, callback)
        return () => {
          mapRef.current.off(eventName, callback)
        }
      },
      addMarker: (lnglat, options = {}) => {
        const marker = new AMap.Marker({
          position: new AMap.LngLat(lnglat[0], lnglat[1]),
          ...options,
        })
        mapRef.current.add(marker)

        if (options.pos) {
          mapRef.current.setCenter(lnglat)
        }

        return () => {
          mapRef.current.remove(marker)
        }
      },
      addDrivingPath: (startLngLat, endLngLat, opts = {}) => {
        drivingRef.current.search(startLngLat, endLngLat, opts, function (status, result) {
          if (status === 'complete') {
            console.log(result)
          } else {
            console.log('获取驾车数据失败：' + result)
          }
        })
      },
      getAddress: (lnglat) =>
        new Promise((resolve, reject) => {
          const geocoder = new AMap.Geocoder({
            radius: 1000,
            extensions: 'all',
          })
          geocoder.getAddress(lnglat, function (status, result) {
            if (status === 'complete' && result.info === 'OK') {
              resolve(result)
            } else {
              reject()
            }
          })
        }),
      clearMap: () => {
        mapRef.current.clearMap()
        document.querySelector('#panel').innerHTML = ''
      },
    })
  }

  const initEnent = () => {
    // mapRef.current?.on('click', function (e) {
    //   console.log(e)
    // })
  }

  useImperativeHandle(ref, () => ({}))

  useEffect(() => {
    mapInit()
  }, [])

  return (
    <>
      <div id="map_container" className={styles.main}></div>
      <div id="panel" className={styles.panel}>
        {searchResult.map(({ id, name, address, photos }) => (
          <div className={styles.resItem} key={id}>
            <div className={styles.imgWrap}>
              <img
                src={photos?.[0]?.url}
                width={100}
                height={100}
                loading="lazy"
                className={styles.img}
              />
            </div>
            <div className={styles.info}>
              <div className={styles.name}>{name}</div>
              <div className={styles.address}>{address}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
})
