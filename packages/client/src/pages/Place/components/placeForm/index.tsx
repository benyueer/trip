import { Button, Form, Input, InputNumber, Select } from 'antd'

export const PlaceForm = ({ placeForm, onFinish }) => {
  return (
    <Form
      form={placeForm}
      variant="filled"
      onFinish={onFinish}
      labelCol={{ span: 4 }}
      wrapperCol={{ span: 16 }}>
      <Form.Item
        name="name"
        label="名称"
        rules={[{ required: true, message: '请输入' }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="sname"
        label="简称"
        rules={[{ required: true, message: '请输入' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="description" label="描述">
        <Input.TextArea />
      </Form.Item>
      <Form.Item
        name="level"
        label="等级"
        rules={[{ required: true, message: '请输入' }]}>
        <InputNumber min={1} max={10} changeOnWheel />
      </Form.Item>
      <Form.Item name="type" label="类型">
        <Select
          style={{ width: 120 }}
          options={[
            { value: 'scenery', label: '景点' },
            { value: 'hotel', label: '酒店' },
            { value: 'restaurant', label: '餐馆' },
            { value: 'shopping', label: '购物' },
            { value: 'parking', label: '停车场' },
            { value: 'marker', label: '标记点' },
          ]}
        />
      </Form.Item>
      <Form.Item label="经纬度">
        <Form.Item
          name="lng"
          style={{
            display: 'inline-block',
            width: 'calc(50% - 8px)',
          }}>
          <Input disabled></Input>
        </Form.Item>
        <Form.Item
          name="lat"
          style={{
            display: 'inline-block',
            width: 'calc(50% - 8px)',
            margin: '0 8px',
          }}>
          <Input disabled></Input>
        </Form.Item>
      </Form.Item>
      <Form.Item label="省市">
        <Form.Item
          name="province"
          style={{
            display: 'inline-block',
            width: 'calc(50% - 8px)',
          }}>
          <Input disabled></Input>
        </Form.Item>
        <Form.Item
          name="city"
          style={{
            display: 'inline-block',
            width: 'calc(50% - 8px)',
            margin: '0 8px',
          }}>
          <Input disabled></Input>
        </Form.Item>
      </Form.Item>
      <Form.Item wrapperCol={{ offset: 4, span: 16 }}>
        <Button type="primary" htmlType="submit" style={{ width: 200 }}>
          保存
        </Button>
      </Form.Item>
    </Form>
  )
}
