import { useEffect, useState } from 'react'
import styles from './styles.module.less'
import {
  Button,
  Col,
  Dropdown,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  TimePicker,
  message,
} from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { PlaceSearchSelect } from '../../../../components/PlaceSearchSelect'
import {
  addDayReq,
  addMilestoneReq,
  addPlanReq,
  deleteDayReq,
  deleteMilestoneReq,
  getPlanReq,
  updateDayReq,
  updateMilestoneReq,
  updatePlanReq,
} from '../../../../api/service'
import { useMapStore } from '../../../../store'

const colors = [
  '#355c7d',
  '#6c5b7b',
  '#c06c84',
  '#f67280',
  '#3490de',
  '#ff9999',
  '#66b3ff',
]

const milestoneTYpeOptions = [
  { label: '长途旅行', value: 'LONG_DISTANCE' },
  { label: '短途旅行', value: 'SHORT_DISTANCE' },
  { label: '睡觉', value: 'NIGHT_REST' },
  { label: '休息', value: 'SHORT_REST' },
  { label: '吃饭', value: 'EAT' },
  { label: '游览', value: 'PLAY' },
]

export const PlanForm = ({ planId, edit }) => {
  const aMap = useMapStore((state) => state.aMap)
  const [messageApi, contextHolder] = message.useMessage()
  const [state, setState] = useState({
    isEdit: false,
    isAdd: true,
  })
  const [planState, setPlanState] = useState({
    name: '',
    description: '',
    tags: [],
    duration: '',
    days: [],
  })
  const [milestoneAddState, setMilestoneAddState] = useState({
    isAdd: true,
    dayIndex: 0,
    milestoneIndex: 0,
    milestoneId: null,
    visible: false,
  })
  const [loadingState, setLoadingState] = useState({
    addDaying: false,
    addMilestoneing: false,
    savePlaning: false,
  })

  const [milestoneForm] = Form.useForm()

  const buildMilestoreMenuItems = (dayId, milestionId) => [
    {
      label: <Button type="link">编辑</Button>,
      key: 'edit',
    },
    {
      label: <Button type="link">前移</Button>,
      key: 'left',
    },
    {
      label: <Button type="link">后移</Button>,
      key: 'right',
    },
    {
      label: (
        <Popconfirm
          title="删除里程碑"
          description="确定删除吗?"
          onConfirm={() => deleteMilestone(dayId, milestionId)}
          okText="Yes"
          cancelText="No">
          <Button danger type="link">
            删除
          </Button>
        </Popconfirm>
      ),
      key: 'delete',
    },
  ]

  const initPlan = async () => {
    if (planId) {
      const res = await getPlanReq(planId)
      if (res.data.code === 0) {
        setPlanState(res.data.data)
        drawPlanPath(res.data.data)
      }
    } else {
      setPlanState({
        name: '',
        description: '',
        tags: [],
        duration: '',
        days: [],
      })
    }
  }

  useEffect(() => {
    initPlan()
  }, [planId])

  const addDay = async () => {
    try {
      setLoadingState({ ...loadingState, addDaying: true })
      const res = await addDayReq({
        dayIndex: planState.days.length,
        milestones: [],
      })
      if (res.data.code === 0) {
        setPlanState({
          ...planState,
          days: [...planState.days, res.data.data],
        })
      } else {
        throw new Error()
      }
    } catch (e: any) {
      console.log(e)
    } finally {
      setLoadingState({ ...loadingState, addDaying: false })
    }
  }

  const deleteDay = async (dayId: string) => {
    // setPlanState({
    //   ...planState,
    //   days: planState.days.filter((_, i) => i !== index),
    // })
    const res = await deleteDayReq(planId, dayId)
    if (res.data.code === 0) {
      initPlan()
    } else {
      messageApi.error('删除失败')
    }
  }

  const moveDayTo = (index: number, direction: 1 | -1) => {
    const days = [...planState.days]
    const temp = days[index]
    days[index] = days[index + direction]
    days[index + direction] = temp

    console.log(days)
    setPlanState({ ...planState, days })
  }

  const deleteMilestone = async (dayId: string, milestoneId: string) => {
    const res = await deleteMilestoneReq(dayId, milestoneId)
    if (res.data.code === 0) {
      messageApi.success('删除成功')
      initPlan()
    } else {
      messageApi.error('删除失败')
    }
  }

  const addMilestone = (dayIndex: number) => {
    setMilestoneAddState({
      ...milestoneAddState,
      isAdd: true,
      dayIndex,
      visible: true,
    })
  }

  const addMilestoneHandler = async () => {
    try {
      setLoadingState({
        ...loadingState,
        addMilestoneing: true,
      })
      const params = milestoneForm.getFieldsValue()
      params.startAt = params.startAt.format('HH:mm')
      params.endAt = params.endAt.format('HH:mm')
      console.log(params)

      const req = milestoneAddState.isAdd ? addMilestoneReq : updateMilestoneReq

      const res = await req(params)
      if (res.data.code === 0) {
        if (milestoneAddState.isAdd) {
          setPlanState({
            ...planState,
            days: planState.days.map((day, i) =>
              i === milestoneAddState.dayIndex
                ? {
                    ...day,
                    milestones: [...day.milestones, res.data.data],
                  }
                : day,
            ),
          })
          const updateDayParams = {
            ...planState.days[milestoneAddState.dayIndex],
          }
          updateDayParams.milestones = [
            ...updateDayParams.milestones.map(({ _id }) => _id),
            res.data.data._id,
          ]
          const resDay = await updateDayReq(updateDayParams)
        }
        initPlan()
        
        setMilestoneAddState({
          ...milestoneAddState,
          visible: false,
        })
      } else {
        throw new Error()
      }
    } catch (e) {
      console.log(e)
    } finally {
      setLoadingState({
        ...loadingState,
        addMilestoneing: false,
      })
    }
  }

  const savePlan = async () => {
    try {
      setLoadingState({
        ...loadingState,
        savePlaning: true,
      })

      const req = planId && edit ? updatePlanReq : addPlanReq

      const params = { ...planState }
      params.days = params.days.map((day) => day._id)

      const res = await req(params)

      if (res.data.code === 0) {
      } else {
        throw new Error()
      }
    } catch (e) {
      console.log(e)
    } finally {
      setLoadingState({
        ...loadingState,
        savePlaning: false,
      })
    }
  }

  const drawPlanPath = (planState) => {
    aMap.clearMap()

    planState.days.map((day, dayIndex) => {
      day.milestones.map((milestone, milestoneIndex) => {
        const { startPoint, endPoint, place } = milestone
        if (place) {
          aMap.addMarker([place.lng, place.lat])
        } else if (startPoint && endPoint) {
          aMap.addDrivingPath([startPoint.lng, startPoint.lat], [endPoint.lng, endPoint.lat])
        }
      })
    })
  }

  return (
    <div className={styles.main}>
      {contextHolder}
      <div className={styles.infoWrap}>
        <Row gutter={[10, 10]}>
          <Col span={12}>
            <Input
              value={planState.name}
              onChange={(e) =>
                setPlanState({ ...planState, name: e.target.value })
              }
              placeholder="名称"
              variant="filled"
              readOnly={!edit}
            />
          </Col>
          <Col span={12}>
            <Select
              value={planState.tags}
              mode="tags"
              placeholder="Tags"
              style={{ width: '100%' }}
              onChange={(value) => setPlanState({ ...planState, tags: value })}
              disabled={!edit}
            />
          </Col>
          <Col span={24}>
            <Input.TextArea
              value={planState.description}
              onChange={(e) =>
                setPlanState({ ...planState, description: e.target.value })
              }
              placeholder="描述"
              variant="filled"
              readOnly={!edit}
            />
          </Col>
        </Row>
      </div>
      <div className={styles.daysWrap}>
        {planState.days.map((day, index) => (
          <div className={styles.dayItem} key={index}>
            <div
              className={styles.dayIndexWrap}
              style={{
                '--bg': colors[Math.floor(Math.random() * colors.length)],
              }}>
              第{index + 1}天
            </div>
            {edit && (
              <div className={styles.actionWrap}>
                <Button
                  type="link"
                  size="small"
                  disabled={index === 0}
                  onClick={() => moveDayTo(index, -1)}>
                  <ArrowUpOutlined />
                </Button>
                <Button
                  type="link"
                  size="small"
                  disabled={index === planState.days.length - 1}
                  onClick={() => moveDayTo(index, 1)}>
                  <ArrowDownOutlined />
                </Button>
                <Popconfirm
                  title="确定删除吗？"
                  onConfirm={() => deleteDay(day._id)}
                  okText="Yes"
                  cancelText="No">
                  <Button type="link" size="small" danger>
                    <DeleteOutlined />
                  </Button>
                </Popconfirm>
              </div>
            )}
            <div className={styles.milestonesOuter}>
              <div className={styles.milestonesWrap}>
                {day.milestones.map(
                  (
                    {
                      name,
                      place,
                      startPoint,
                      endPoint,
                      description,
                      startAt,
                      endAt,
                      _id,
                    },
                    i,
                  ) => (
                    <div key={i} className={styles.milestoneItem}>
                      <Dropdown
                        menu={{
                          items: buildMilestoreMenuItems(day._id, _id),
                        }}
                        trigger={edit ? ['contextMenu'] : []}>
                        <div className={styles.milestoneItemContent}>
                          <div className={styles.mNameWrap}>{name}</div>
                          <div className={styles.mPlaceWrap}>
                            {place ? (
                              <div className={styles.point}>
                                <Tag color="#2db7f5" style={
                                  {maxWidth: '100%'}
                                }>
                                  {place.sname || place.name}
                                </Tag>
                              </div>
                            ) : (
                              startPoint &&
                              endPoint && (
                                <>
                                  <div className={styles.point}>
                                    <Tag color="#2db7f5">
                                      {startPoint.sname || startPoint.name}
                                    </Tag>
                                  </div>
                                  <div className={styles.pointArrow}>
                                    <ArrowRightOutlined />
                                  </div>
                                  <div className={styles.point}>
                                    <Tag color="#87d068">
                                      {endPoint.sname || endPoint.name}
                                    </Tag>
                                  </div>
                                </>
                              )
                            )}
                          </div>
                          <div className={styles.mDescriptionWrap}>
                            {description}
                          </div>
                          <div className={styles.mTimeWrap}>
                            <span>{startAt}</span>
                            <span>{endAt}</span>
                          </div>
                        </div>
                      </Dropdown>
                    </div>
                  ),
                )}
                {edit && (
                  <Button
                    type="primary"
                    style={{ width: 40, height: '100%' }}
                    className={styles.addMilestoneBtn}
                    onClick={() => addMilestone(index)}>
                    +
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <Row gutter={10}>
          <Col span={12}>
            <Button
              type="primary"
              style={{ width: '100%' }}
              onClick={addDay}
              loading={loadingState.addDaying}>
              添加一天
            </Button>
          </Col>
          <Col span={12}>
            <Button type="primary" style={{ width: '100%' }} onClick={savePlan}>
              保存
            </Button>
          </Col>
        </Row>
      )}
      <Modal
        title="里程碑"
        open={milestoneAddState.visible}
        onCancel={() =>{
          setMilestoneAddState({ ...milestoneAddState, visible: false })
          milestoneForm.resetFields()
        }}
        footer={null}>
        <Form
          form={milestoneForm}
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 16 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="名称" />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select options={milestoneTYpeOptions} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="描述" />
          </Form.Item>
          <Form.Item name="startAt" label="开始时间">
            <TimePicker format="HH:mm" />
          </Form.Item>
          <Form.Item name="endAt" label="结束时间">
            <TimePicker format="HH:mm" />
          </Form.Item>
          <Form.Item name="startPoint" label="起始点">
            <PlaceSearchSelect />
          </Form.Item>
          <Form.Item name="endPoint" label="结束点">
            <PlaceSearchSelect />
          </Form.Item>
          <Form.Item name="place" label="地点">
            <PlaceSearchSelect />
          </Form.Item>
          <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
            <Space>
              <Button
                onClick={() =>
                  setMilestoneAddState({ ...milestoneAddState, visible: false })
                }>
                取消
              </Button>
              <Button
                type="primary"
                onClick={addMilestoneHandler}
                loading={loadingState.addMilestoneing}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
