import { Select } from 'antd'
import { useState } from 'react'
import { getPlacesReq } from '../../api/service'
import { debounce } from '../../utils'

export const PlaceSearchSelect = (props) => {
  const [options, setOptions] = useState([])
  const [value, setValue] = useState(props.value || null)

  const handleSearch = debounce(async (name) => {
    const res = await getPlacesReq({
      name,
      page: 1,
      limit: 100,
    })

    if (res.data.code === 0) {
      const options = res.data.data.data.map((item) => ({
        value: item._id,
        label: item.name,
      }))
      console.log(options)
      setOptions(options)
    } else {
      setOptions([])
    }
  }, 1000)

  return (
    <Select
      showSearch
      value={value}
      placeholder={props.placeholder}
      style={props.style}
      filterOption={false}
      onSearch={handleSearch}
      onFocus={() => handleSearch('')}
      options={options}
      onChange={(value) => {
        setValue(value)
        props.onChange(value)
      }}></Select>
  )
}
