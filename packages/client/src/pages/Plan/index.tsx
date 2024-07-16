import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  TimePicker,
  message,
} from 'antd'
import styles from './styles.module.less'
import { useState } from 'react'
import { deletePlanReq, getPlansReq } from '../../api/service'
import { PlanForm } from './components/planForm'
import {
  DownOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useMapStore } from '../../store'

export const Plan = () => {
  const [messageApi, contextHolder] = message.useMessage()
  const [state, setState] = useState({
    detailOpen: false,
    curPlanId: null,
    edit: false,
  })
  const [searchModel, setSearchModel] = useState({
    name: '',
    tag: '',
    limit: 10,
    page: 1,
  })
  const [loading, setLoading] = useState(false)
  const [dataListState, setDataListState] = useState({
    total: 0,
    list: [],
  })

  const searchPlans = async (query) => {
    try {
      setLoading(true)
      const res = await getPlansReq(query)
      if (res.data.code === 0) {
        const { data, total } = res.data.data
        setDataListState({ list: data, total })
      } else {
        throw new Error(res.data.message || '获取计划失败')
      }
    } catch (error) {
      messageApi.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const resetSearch = () => {
    const nextModel = {
      ...searchModel,
      name: '',
      tag: '',
    }
    setSearchModel(nextModel)
    searchPlans(nextModel)
  }

  const toAddPlan = () => {
    setState({ ...state, detailOpen: true, edit: true, curPlanId: null })
  }

  const deletePlan = async (id) => {
    const res = await deletePlanReq(id)
    if (res.data.code === 0) {
      searchPlans(searchModel)
    } else {
    }
  }

  return (
    <div className={styles.main}>
      {contextHolder}
      <p className={styles.header}>计划</p>
      <div className={styles.searchWrap}>
        <Space>
          <Input
            value={searchModel.name}
            onChange={(event) =>
              setSearchModel({ ...searchModel, name: event.target.value })
            }
            placeholder="名称"></Input>
          <Input
            value={searchModel.tag}
            onChange={(event) =>
              setSearchModel({ ...searchModel, tag: event.target.value })
            }
            placeholder="Tag"></Input>
          <Button
            type="primary"
            onClick={() => searchPlans(searchModel)}
            loading={loading}>
            搜索
          </Button>
          <Button onClick={resetSearch}>重置</Button>
          <Button onClick={toAddPlan} type="primary">
            添加
          </Button>
        </Space>
      </div>
      <div className={styles.mainContent}>
        <div
          className={[
            styles.planDetailWrap,
            state.detailOpen && styles.detailOpen,
          ].join(' ')}>
          <div className={styles.planDetail}>
            {state.detailOpen && (
              <PlanForm planId={state.curPlanId} edit={state.edit} />
            )}
          </div>
          <div
            className={styles.detailOpenBtnWrap}
            onClick={() =>
              setState({ ...state, detailOpen: !state.detailOpen })
            }>
            <DownOutlined className={styles.detailOpenBtn} />
          </div>
        </div>
        <div className={styles.planListWrap}>
          <div className={styles.itemWrap}>
            {dataListState.list.map((item) => {
              return (
                <div className={styles.planItem} key={item._id}>
                  <div className={styles.planNameWrap}>{item.name}</div>
                  <div className={styles.infoWrap}>
                    <div className={styles.descriptionWrap}>
                      <div className={styles.description}>
                        {item.description}
                      </div>
                      <div className={styles.tagWrap}>
                        {item.tags.map((tag) => (
                          <div className={styles.tag} key={tag}>
                            {tag}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.actionWrap}>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() =>
                          setState({
                            ...state,
                            curPlanId: item._id,
                            detailOpen: true,
                            edit: false,
                          })
                        }
                        icon={<EyeOutlined />}></Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() =>
                          setState({
                            ...state,
                            curPlanId: item._id,
                            detailOpen: true,
                            edit: true,
                          })
                        }
                        icon={<EditOutlined />}></Button>
                      <Popconfirm
                        title="删除计划"
                        description="确定删除吗?"
                        onConfirm={() => deletePlan(item._id)}
                        okText="Yes"
                        cancelText="No">
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          size="small"></Button>
                      </Popconfirm>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className={styles.paginationWrap}></div>
        </div>
      </div>
    </div>
  )
}
