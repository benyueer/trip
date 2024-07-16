import {
  Radio,
  message,
  Input,
  Form,
  Select,
  Space,
  Button,
  InputNumber,
  Pagination,
  Modal,
} from 'antd'
import type { RadioChangeEvent } from 'antd'
import styles from './style.module.less'
import { useCallback, useEffect, useState } from 'react'
import { addPlaceReq, deletePlaceReq, getPlacesReq } from '../../api/service'
import { useMapStore } from '../../store'
import { useForm } from 'antd/es/form/Form'
import { PlaceItem } from './components/placeItem'
import { PlaceForm } from './components/placeForm'

const { Search } = Input

const placeOptions = [
  {
    label: '已标记地点',
    value: 'labeledPlace',
  },
  {
    label: '标记地点',
    value: 'markPlace',
  },
]

const markerMap = new Map()

export const Place = () => {
  const [messageApi, contextHolder] = message.useMessage()
  const [activeTab, setActiveTab] = useState('labeledPlace')
  const [placeList, setPlaceList] = useState([])
  const [loading, setLoading] = useState(false)
  const [activePlaces, setActivePlaces] = useState(new Set())
  const [curClickPlace, setCurClickPlace] = useState(null)
  const [markerToRemove, setMarkerToRemove] = useState([])
  const [isEditPlaceModalOpen, setIsEditPlaceModalOpen] = useState(false)
  const [editPlaceId, setEditPlaceId] = useState(null)
  const [searchModel, setSearchModel] = useState({
    name: '',
    province: '',
    city: '',
    limit: 10,
    page: 1,
    total: 0,
  })

  const aMap = useMapStore((state) => state.aMap)

  const getPlaceList = async (query) => {
    try {
      setLoading(true)
      const res = await getPlacesReq(query)
      if (res.data.code === 0) {
        setPlaceList(res.data.data.data)
        setSearchModel({
          ...searchModel,
          ...query,
          total: res.data.data.total,
        })
      } else {
        throw new Error()
      }
    } catch (e) {
      messageApi.error('获取地点列表失败')
    } finally {
      setLoading(false)
    }
  }

  const searchReset = () => {
    const nestState = {
      ...searchModel,
      name: '',
      province: '',
      city: '',
      limit: 10,
      page: 1,
    }
    setSearchModel(nestState)
    getPlaceList(nestState)
  }

  useEffect(() => {
    return () => {
      aMap?.clearMap()
      markerMap.clear()
    }
  }, [aMap])

  useEffect(() => {
    if (activeTab === 'labeledPlace') {
      markerToRemove.forEach((i) => i())
      aMap?.clearMap()
      setCurClickPlace(null)
      getPlaceList(searchModel)
    } else if (activeTab === 'markPlace' && aMap) {
      return aMap.addEventHandler('click', async (e) => {
        markerToRemove.forEach((i) => i())
        console.log(e)
        const {
          lnglat: { lng, lat },
        } = e

        const removeMarker = aMap.addMarker([lng, lat], {})
        setMarkerToRemove([removeMarker])

        const address = await aMap.getAddress([lng, lat])
        console.log(address)

        const {
          regeocode: {
            formattedAddress,
            addressComponent: { province, city },
          },
        } = address

        setCurClickPlace({
          lng,
          lat,
          address: formattedAddress,
          province,
          city,
        })

        placeForm.setFieldsValue({
          name: formattedAddress,
          lng,
          lat,
          level: 3,
          province,
          city,
          type: 'scenery',
        })
      })
    }
  }, [activeTab, setCurClickPlace, aMap, markerToRemove])

  const placeItemClickHandler = useCallback(
    (id) => {
      console.log(13123, id)
      const curPlace = placeList.find((i) => i._id === id)
      const { lng, lat, _id } = curPlace
      if (activePlaces.has(id)) {
        activePlaces.delete(id)
        markerMap.get(_id)?.()
      } else {
        activePlaces.add(id)
        const closeFn = aMap.addMarker([lng, lat], { pos: true })
        markerMap.set(_id, closeFn)
      }
      setActivePlaces(new Set(activePlaces))
    },
    [activePlaces, aMap, placeList],
  )

  const searchPlaceHandler = useCallback(
    (place) => {
      if (aMap) {
        aMap.searchPlace(place)
      }
    },
    [aMap],
  )

  const addPlaceSubmit = async (model) => {
    console.log(model)
    try {
      setLoading(true)
      const res = await addPlaceReq({
        ...model,
      })

      if (res.data.code === 0) {
        messageApi.success('添加地点成功')
        placeForm.resetFields()
      }
    } catch (e) {
      messageApi.error('添加地点失败')
    } finally {
      setLoading(false)
    }
  }

  const [placeForm] = Form.useForm()

  const deletePlaceHandler = async (id) => {
    try {
      markerMap.get(id)?.()
      setLoading(true)
      const res = await deletePlaceReq(id)

      if (res.data.code === 0) {
        messageApi.success('删除地点成功')
        getPlaceList(searchModel)
      }
    } catch (e) {
      messageApi.error('删除地点失败')
    } finally {
      setLoading(false)
    }
  }

  const editPlaceHandler = (id) => {
    setEditPlaceId(id)
    placeForm.setFieldsValue({
      ...placeList.find((i) => i._id === id),
    })
    setIsEditPlaceModalOpen(true)
  }

  const updateSearchModel = (value) => {
    setSearchModel({ ...searchModel, ...value })
  }

  const onSearchPageChange = (page, limit) => {
    const nextSearchModel = { ...searchModel, page, limit }
    console.log(nextSearchModel)
    setSearchModel(nextSearchModel)
    getPlaceList(nextSearchModel)
  }

  const editModalCloseHandler = () => {
    setIsEditPlaceModalOpen(false)
    setEditPlaceId(null)
  }

  return (
    <div className={styles.main}>
      {contextHolder}
      <p className={styles.header}>标记点</p>
      <div className={styles.container}>
        <div className={styles.actionWrap}>
          <Radio.Group
            value={activeTab}
            options={placeOptions}
            optionType="button"
            buttonStyle="solid"
            onChange={(e: RadioChangeEvent) => {
              setActiveTab(e.target.value)
            }}
          />
        </div>
        <div className={styles.mainContent}>
          {activeTab === 'labeledPlace' && (
            <div className={styles.placeListWrap}>
              <div className={styles.filterWrap}>
                <Space>
                  <Input
                    value={searchModel.name}
                    onChange={(e) =>
                      updateSearchModel({ name: e.target.value })
                    }
                    placeholder="名称"></Input>
                  <Input
                    value={searchModel.province}
                    onChange={(e) =>
                      updateSearchModel({ province: e.target.value })
                    }
                    placeholder="省"></Input>
                  <Input
                    value={searchModel.city}
                    onChange={(e) =>
                      updateSearchModel({ city: e.target.value })
                    }
                    placeholder="市"></Input>
                  <Button
                    type="primary"
                    onClick={() => getPlaceList({...searchModel, page: 1})}>
                    搜索
                  </Button>
                  <Button onClick={searchReset}>重置</Button>
                </Space>
              </div>
              <div className={styles.placeListContent}>
                {placeList.map((item) => (
                  <PlaceItem
                    key={item._id}
                    item={item}
                    active={activePlaces.has(item._id)}
                    onOpen={() => placeItemClickHandler(item._id)}
                    onDelete={() => deletePlaceHandler(item._id)}
                    onEdit={() => editPlaceHandler(item._id)}
                  />
                ))}
              </div>
              <div className={styles.pageWrap}>
                <Pagination
                  showQuickJumper
                  defaultCurrent={searchModel.page}
                  current={searchModel.page}
                  pageSize={searchModel.limit}
                  total={searchModel.total}
                  onChange={onSearchPageChange}
                />
              </div>
            </div>
          )}
          {activeTab === 'markPlace' && (
            <div className={styles.markPlaceWrap}>
              <Search
                placeholder="输入地点"
                allowClear
                enterButton="搜索地点"
                size="large"
                style={{ marginBottom: '12px' }}
                onSearch={(pName) => searchPlaceHandler(pName)}
              />
              {curClickPlace && (
                <>
                  <div className={styles.toChooseInfoWrap}>
                    <span className={[styles.labelLow, styles.left].join(' ')}>
                      位置在：
                    </span>
                    <span className={styles.addresName}>
                      {curClickPlace.province}-{curClickPlace.city}
                    </span>
                    <span className={styles.addresName}>
                      {curClickPlace.address}
                    </span>
                    <span className={[styles.labelLow, styles.right].join(' ')}>
                      附近
                    </span>
                  </div>
                  <div className={styles.placeInfoFormWrap}>
                    <PlaceForm
                      placeForm={placeForm}
                      onFinish={addPlaceSubmit}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <Modal
        title="编辑地点信息"
        open={isEditPlaceModalOpen}
        onCancel={editModalCloseHandler}
        footer={null}>
        <PlaceForm placeForm={placeForm} onFinish={addPlaceSubmit} />
      </Modal>
    </div>
  )
}
