import { pre, prop } from '@typegoose/typegoose';
import { Query } from 'mongoose';

// TODO hook of populate deleted_at
@pre<BasicModel>(/find|count/, function (next) {
  // console.log('@pre<BasicModel>', this);
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const q: Query<any, any> = this as any;
  // console.log(q.getQuery());
  const query = q.getQuery();
  if (!query._id && !query.deleted_at) {
    // * 当不指定id和deleted_at的时候, 自动过滤已删除的数据
    // console.log('add deleted_at', q.getQuery());
    q.where('deleted_at', null);
  }
  next();
})
// eslint-disable-next-line @typescript-eslint/no-unused-vars
@pre<BasicModel>(/findOneAndRemove|remove|findByIdAndRemove/, function (_next) {
  throw new Error('not use remove');
})
@pre<BasicModel>(/save|findByIdAndUpdate/, function (next) {
  // * update time
  this.updated_at = new Date();
  next();
})
export class BasicModel {
  @prop({ default: () => new Date(), index: true })
  created_at: Date;

  @prop({ default: () => new Date() })
  updated_at: Date;

  @prop({ default: null, index: true })
  deleted_at: Date;
}
