// @ntqqapi/types 类型声明文件
// 用于 QQ NT API 的类型定义

export enum ChatType {
  KCHATTYPEUNKNOWN = 0,
  KCHATTYPEDISCUSS = 1,
  KCHATTYPEFRIEND = 2,
  KCHATTYPEGROUP = 3,
  KCHATTYPETEMP = 100,
  KCHATTYPEGUILD = 4,
  KCHATTYPEGUILDCHANNEL = 5,
}

export enum ElementType {
  TEXT = 1,
  PIC = 2,
  FILE = 3,
  PTT = 4,
  VIDEO = 5,
  FACE = 6,
  REPLY = 7,
  GRAYTIP = 8,
  ARK = 9,
  MARKETFACE = 10,
}

// 表情点赞项
export interface EmojiLikeItem {
  emojiId: string
  emojiType: string
  likesCnt: string
  isClicked: boolean
}

// 文本元素 - 扩展属性
export interface TextElement {
  type: ElementType.TEXT
  content?: string
  textElement?: {
    content: string
    atNtUids?: string[]
    atType?: number
  }
  // 允许任意属性
  [key: string]: any
}

// 图片元素 - 扩展属性
export interface PicElement {
  type: ElementType.PIC
  fileName?: string
  filePath?: string
  fileSize?: string
  picWidth?: number
  picHeight?: number
  picType?: number
  sourcePath?: string
  thumbPath?: string
  picElement?: {
    originalInfo?: {
      url?: string
      size?: {
        width?: number
        height?: number
      }
    }
    md5?: string
    picId?: string
    picWidth?: number
    picHeight?: number
    size?: {
      width?: number
      height?: number
    }
  }
  // 允许任意属性
  [key: string]: any
}

// 文件元素 - 扩展属性
export interface FileElement {
  type: ElementType.FILE
  fileName?: string
  filePath?: string
  fileSize?: string
  fileElement?: {
    fileName: string
    fileSize: string
    filePath?: string
    fileUrl?: string
  }
  // 允许任意属性
  [key: string]: any
}

// 语音元素 - 扩展属性
export interface PttElement {
  type: ElementType.PTT
  fileName?: string
  filePath?: string
  fileSize?: string
  duration?: number
  pttElement?: {
    fileName: string
    filePath: string
    duration: number
    fileUuid?: string
    localPath?: string
  }
  // 允许任意属性
  [key: string]: any
}

// 视频元素 - 扩展属性
export interface VideoElement {
  type: ElementType.VIDEO
  fileName?: string
  filePath?: string
  fileSize?: string
  thumbPath?: string
  duration?: number
  videoElement?: {
    fileName: string
    thumbPath?: string
    fileUuid?: string
    videoSize?: {
      width?: number
      height?: number
    }
  }
  // 允许任意属性
  [key: string]: any
}

// 表情元素 - 扩展属性
export interface FaceElement {
  type: ElementType.FACE
  faceIndex?: number
  faceType?: number
  faceElement?: {
    faceIndex: number
    faceType?: number
    faceId?: string
    stableFaceId?: string
  }
  // 允许任意属性
  [key: string]: any
}

// 回复元素 - 扩展属性
export interface ReplyElement {
  type: ElementType.REPLY
  messageId?: string
  messageSeq?: string
  senderUid?: string
  senderUin?: string
  senderNickName?: string
  replyMsgTime?: string
  elements?: MessageElement[]
  replyElement?: {
    messageId: string
    messageSeq: string
    senderUid: string
    senderUin: string
    senderNickName: string
    replyMsgTime: string
    elements: MessageElement[]
  }
  // 允许任意属性
  [key: string]: any
}

// 灰提示元素 - 扩展属性
export interface GrayTipElement {
  type: ElementType.GRAYTIP
  subElementType?: number
  content?: string
  grayTipElement?: {
    subElementType: number
    content: string
    jsonGrayTipElement?: {
      jsonStr: string
    }
    xmlElement?: {
      content: string
    }
  }
  // 允许任意属性
  [key: string]: any
}

// ARK元素
export interface ArkElement {
  type: ElementType.ARK
  bytesData?: string
  arkElement?: {
    bytesData: string
  }
  // 允许任意属性
  [key: string]: any
}

// 商城表情元素
export interface MarketFaceElement {
  type: ElementType.MARKETFACE
  faceId?: string
  tabId?: string
  key?: string
  faceName?: string
  marketFaceElement?: {
    faceId: string
    tabId: string
    key: string
  }
  // 允许任意属性
  [key: string]: any
}

// 使用 any 类型来避免 union narrowing 问题
export type MessageElement = any

export interface RawMessage {
  msgId: string
  msgSeq: string
  msgTime: string
  msgRandom: string
  senderUid: string
  senderUin: string
  senderNickName: string
  senderCard?: string
  senderRole?: number
  chatType: ChatType
  peerUid: string
  peerUin: string
  elements: MessageElement[]
  // 扩展属性
  msgAttrs?: {
    [key: string]: unknown
  }
  recallTime?: string
  emojiLikesList?: EmojiLikeItem[]
  // 允许任意属性
  [key: string]: any
}

// 原始消息（用于回复源消息）
export interface RawSourceMessage {
  msgId: string
  senderUin: string
  senderNickName?: string
  sendMemberName?: string
  sendNickName?: string
  elements?: MessageElement[]
  // 允许任意属性
  [key: string]: any
}

// 用户资料
export interface UserProfile {
  uid: string
  uin: string
  nick: string
  avatar?: string
  // 扩展属性
  qid?: string
  groupRole?: 'owner' | 'admin' | 'member'
  groupLevel?: number
  groupTitle?: string
  // 允许任意属性
  [key: string]: any
}
