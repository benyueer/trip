import React, { useState, useEffect } from 'react'
import { useTripStore } from '../store'
import { X, MapPin, Check, Trash2, Phone, Clock, Star, Tag, FileText } from 'lucide-react'

export default function PlaceModal() {
  const { editingItem, setEditingItem, addPlace, updatePlace, deleteItem } = useTripStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ticket, setTicket] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [openingHours, setOpeningHours] = useState('')
  const [rating, setRating] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (editingItem?.item) {
      setName(editingItem.item.name || '')
      setDescription(editingItem.item.description || '')
      setTicket((editingItem.item as any).ticket || '')
      setAddress((editingItem.item as any).address || '')
      setPhone((editingItem.item as any).phone || '')
      setOpeningHours((editingItem.item as any).openingHours || '')
      setRating((editingItem.item as any).rating || '')
      setCategory((editingItem.item as any).category || '')
      setNotes((editingItem.item as any).notes || '')
    } else {
      setName('')
      setDescription('')
      setTicket('')
      setAddress('')
      setPhone('')
      setOpeningHours('')
      setRating('')
      setCategory('')
      setNotes('')
    }
  }, [editingItem])

  if (!editingItem) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (editingItem.type === 'add' && editingItem.lngLat) {
      addPlace(editingItem.dayIndex, {
        id: crypto.randomUUID(),
        type: 'place',
        name: name.trim(),
        description: description.trim(),
        ticket: ticket.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        openingHours: openingHours.trim() || undefined,
        rating: rating.trim() || undefined,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        lngLat: editingItem.lngLat
      })
    } else if (editingItem.type === 'edit' && editingItem.item?.id) {
      updatePlace(editingItem.dayIndex, editingItem.item.id, {
        name: name.trim(),
        description: description.trim(),
        ticket: ticket.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        openingHours: openingHours.trim() || undefined,
        rating: rating.trim() || undefined,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined
      })
    }

    setEditingItem(null)
    setName('')
    setDescription('')
    setTicket('')
    setAddress('')
    setPhone('')
    setOpeningHours('')
    setRating('')
    setCategory('')
    setNotes('')
  }

  const handleDelete = () => {
    if (editingItem.type === 'edit' && editingItem.item?.id) {
      if (confirm('确定要从行程中删除这个地点吗？')) {
        deleteItem(editingItem.dayIndex, editingItem.item.id)
        setEditingItem(null)
      }
    }
  }

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4' onClick={() => setEditingItem(null)}>
      <div 
        className='bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-6 pb-0 flex justify-between items-start'>
          <div className='bg-blue-50 p-3 rounded-2xl'>
            <MapPin className='text-blue-600' size={24} />
          </div>
          <div className='flex items-center gap-2'>
            {editingItem.type === 'edit' && (
              <button 
                onClick={handleDelete}
                className='p-2 hover:bg-red-50 rounded-full transition-colors text-red-400 hover:text-red-600'
                title='删除地点'
              >
                <Trash2 size={20} />
              </button>
            )}
            <button 
              onClick={() => setEditingItem(null)}
              className='p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400'
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className='p-6'>
          <h2 className='text-xl font-bold text-gray-900 mb-1'>
            {editingItem.type === 'add' ? '新增地点' : '修改详情'}
          </h2>
          <p className='text-xs text-gray-500 mb-6 font-medium'>
            {editingItem.type === 'add' ? '输入该位置在行程中的名称与描述' : '修改地名或补充地点描述'}
          </p>

          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='space-y-1.5'>
              <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1'>地名</label>
              <input
                autoFocus
                type='text'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='例如：西湖断桥'
                className='w-full px-5 py-3.5 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-bold placeholder:text-gray-300'
              />
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-1.5'>
                <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1'>
                  <Tag size={12} /> 类别
                </label>
                <input
                  type='text'
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder='例如：景点、餐厅'
                  className='w-full px-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-bold placeholder:text-gray-300'
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1'>
                  <Star size={12} /> 评分
                </label>
                <input
                  type='text'
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  placeholder='例如：4.5 或 暂无'
                  className='w-full px-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-bold placeholder:text-gray-300'
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1'>
                <MapPin size={12} /> 详细地址
              </label>
              <input
                type='text'
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder='请输入具体地址'
                className='w-full px-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-medium placeholder:text-gray-300'
              />
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-1.5'>
                <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1'>
                  <Phone size={12} /> 联系电话
                </label>
                <input
                  type='text'
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder='联系方式'
                  className='w-full px-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-medium placeholder:text-gray-300'
                />
              </div>

              <div className='space-y-1.5'>
                <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1'>
                  <Clock size={12} /> 营业时间
                </label>
                <input
                  type='text'
                  value={openingHours}
                  onChange={(e) => setOpeningHours(e.target.value)}
                  placeholder='例如：09:00-18:00'
                  className='w-full px-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-medium placeholder:text-gray-300'
                />
              </div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='space-y-1.5'>
                <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1'>门票价格</label>
                <div className='relative'>
                  <span className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm'>¥</span>
                  <input
                    type='text'
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    placeholder='例如：80 或 免费'
                    className='w-full pl-9 pr-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-bold placeholder:text-gray-300'
                  />
                </div>
              </div>

              <div className='space-y-1.5'>
                <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1'>地点描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='简短描述...'
                  rows={1}
                  className='w-full px-5 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-medium placeholder:text-gray-300 resize-none'
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <label className='text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1'>
                <FileText size={12} /> 个人备注 / 攻略
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='在这里记录你的攻略、必吃清单等...'
                rows={3}
                className='w-full px-5 py-3.5 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 transition-all outline-none text-gray-900 font-medium placeholder:text-gray-300 resize-none'
              />
            </div>

            <button
              type='submit'
              disabled={!name.trim()}
              className='w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-blue-200 mt-2'
            >
              <Check size={20} />
              确认提交
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
