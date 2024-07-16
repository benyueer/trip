import {
  PictureTwoTone,
  FlagTwoTone,
  ShopTwoTone,
  UpOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { ParkingIcon } from '../../../../icons/parking'
import { ShoppingIcon } from '../../../../icons/shopping'
import { HotelIcon } from '../../../../icons/hotel'
import { RestIcon } from '../../../../icons/rest'
import styles from './style.module.less'
import { Button, Empty, Popconfirm } from 'antd'

const placeTypeMap = {
  scenery: () => <PictureTwoTone twoToneColor="#52c41a" />,
  hotel: () => <HotelIcon />,
  restaurant: () => <RestIcon />,
  shopping: () => <ShoppingIcon />,
  parking: () => <ParkingIcon />,
  marker: () => <FlagTwoTone />,
}

const placeTypeNameMap = {
  scenery: '景点',
  hotel: '酒店',
  restaurant: '餐厅',
  shopping: '购物',
  parking: '停车场',
  marker: '标记点',
}

export const PlaceItem = ({
  item: { type, name, images, level, description },
  active,
  onOpen,
  onDelete,
  onEdit,
}) => {
  return (
    <div className={styles.main}>
      <div className={styles.nameWrap}>
        <div className={styles.nameWithIcon}>
          <div className={styles.iconWrap}>{placeTypeMap[type]?.()}</div>
          <span className={styles.nameLabel}>{name}</span>
        </div>
        <span className={styles.opneIcon} onClick={onOpen}>
          <UpOutlined
            className={[
              styles.openIconBase,
              active && styles.openIconActive,
            ].join(' ')}
          />
        </span>
      </div>
      <div
        className={[styles.detailWrap, active && styles.detailOpen].join(' ')}>
        <div className={styles.imageWrap}>
          {images.length === 0 ? (
            <Empty />
          ) : (
            images.map((image) => <img key={image} src={image} alt="" />)
          )}
        </div>
        <div className={styles.trim}></div>
        <div className={styles.infoWrap}>
          <div className={styles.topInfo}>
            {placeTypeNameMap[type]} - {level}
          </div>
          <div className={styles.bottomInfo}>{description}</div>
        </div>
        <div className={styles.trim}></div>
        <div className={styles.actionWrap}>
          <Button
            onClick={onEdit}
            size="small"
            type="primary"
            icon={<EditOutlined />}
          />
          <Popconfirm
            title="删除地点"
            description="确定删除吗?"
            onConfirm={onDelete}
            okText="Yes"
            cancelText="No">
            <Button danger icon={<DeleteOutlined />} size="small"></Button>
          </Popconfirm>
        </div>
      </div>
    </div>
  )
}
