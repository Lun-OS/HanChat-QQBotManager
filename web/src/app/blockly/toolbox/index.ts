import * as Blockly from 'blockly';

function category(name: string, style: string, contents: any[]): any {
  return {
    kind: 'category',
    name,
    categorystyle: style,
    contents,
  };
}

function subCategory(name: string, style: string, contents: any[]): any {
  return {
    kind: 'category',
    name: '> ' + name,
    categorystyle: style,
    contents,
  };
}

function block(type: string): any {
  return { kind: 'block', type };
}

export function getToolboxCategories(): any {
  const msg = Blockly.Msg;
  return {
    kind: 'categoryToolbox',
    contents: [
      // ========== 常用积木（快速访问）==========
      category('常用', 'popular_category', [
        block('event_on_message'),
        block('msg_get_simple_field'),
        block('msg_contains_text'),
        block('message_reply_private'),
        block('message_reply_group'),
        block('message_send_group'),
        block('message_send_private'),
        block('log_info'),
        block('storage_set'),
        block('storage_get'),
        block('http_get'),
        block('text_concat'),
        block('logic_if_else'),
        block('variables_set'),
        block('variables_get'),
      ]),

      // ========== 事件处理 ==========
      category('事件', 'event_category', [
        subCategory('消息事件', 'event_category', [
          block('event_on_message'),
          block('event_on_notice'),
          block('event_on_request'),
        ]),
        subCategory('生命周期', 'event_category', [
          block('event_on_init'),
          block('event_on_destroy'),
        ]),
      ]),

      // ========== 消息操作 ==========
      category('消息', 'message_category', [
        subCategory('读取消息', 'message_category', [
          block('msg_get_simple_field'),
          block('msg_get_text_content'),
          block('msg_contains_text'),
          block('msg_contains_keyword'),
          block('msg_is_group'),
          block('msg_is_private'),
          block('msg_is_type'),
        ]),
        subCategory('消息内容提取', 'message_category', [
          block('msg_get_images'),
          block('msg_get_first_image'),
          block('msg_get_at_users'),
          block('msg_get_reply_info'),
          block('msg_get_sender_id'),
          block('msg_get_sender_nickname'),
          block('msg_get_group_id'),
          block('msg_get_time'),
          block('msg_get_reply_id'),
          block('msg_get_message_type'),
        ]),
        subCategory('消息类型判断', 'message_category', [
          block('msg_has_image'),
          block('msg_has_voice'),
          block('msg_has_video'),
          block('msg_has_face'),
          block('msg_is_at_bot'),
          block('msg_is_at_all'),
        ]),
        subCategory('发送消息', 'message_category', [
          block('message_reply_private'),
          block('message_reply_group'),
          block('message_send_group'),
          block('message_send_private'),
          block('message_send_group_with_result'),
          block('message_send_private_with_result'),
          block('message_send_group_with_var'),
          block('message_send_private_with_var'),
        ]),
        subCategory('发送图片(Base64)', 'message_category', [
          block('send_group_image_base64'),
          block('send_private_image_base64'),
        ]),
        subCategory('消息管理', 'message_category', [
          block('message_delete'),
          block('message_set_essence'),
          block('message_get_essence_list'),
          block('message_send_like'),
        ]),
        subCategory('消息查询', 'message_category', [
          block('onebot_get_msg'),
          block('onebot_get_forward_msg'),
          block('onebot_get_group_msg_history'),
          block('onebot_get_friend_msg_history'),
          block('onebot_get_image'),
          block('onebot_get_record'),
          block('onebot_get_file'),
        ]),
        subCategory('消息操作', 'message_category', [
          block('onebot_forward_group_single_msg'),
          block('onebot_forward_friend_single_msg'),
          block('onebot_mark_msg_as_read'),
          block('onebot_set_msg_emoji_like'),
          block('onebot_unset_msg_emoji_like'),
          block('onebot_delete_essence_msg'),
          block('onebot_voice_msg_to_text'),
        ]),
        subCategory('AI语音', 'message_category', [
          block('onebot_send_group_ai_record'),
          block('onebot_get_ai_characters'),
        ]),
      ]),

      // ========== 群组管理 ==========
      category('群组', 'group_category', [
        subCategory('群信息查询', 'group_category', [
          block('group_get_list'),
          block('group_get_members'),
        ]),
        subCategory('群成员管理', 'group_category', [
          block('group_kick'),
          block('group_set_ban'),
          block('group_set_card'),
          block('group_set_admin'),
          block('group_poke'),
        ]),
        subCategory('群设置', 'group_category', [
          block('group_set_whole_ban'),
          block('group_set_name'),
        ]),
        subCategory('群信息', 'group_category', [
          block('onebot_get_group_info'),
          block('onebot_get_group_member_info'),
          block('onebot_get_group_honor_info'),
          block('onebot_get_group_system_msg'),
          block('onebot_get_group_at_all_remain'),
          block('onebot_get_group_shut_list'),
          block('onebot_get_group_ignore_add_request'),
        ]),
        subCategory('群管理', 'group_category', [
          block('onebot_set_group_leave'),
          block('onebot_set_group_special_title'),
          block('onebot_set_group_remark'),
          block('onebot_set_group_msg_mask'),
          block('onebot_send_group_sign'),
          block('onebot_batch_delete_group_member'),
        ]),
        subCategory('群公告', 'group_category', [
          block('onebot_get_group_notice'),
          block('onebot_send_group_notice'),
          block('onebot_delete_group_notice'),
        ]),
        subCategory('群相册', 'group_category', [
          block('onebot_get_group_album_list'),
          block('onebot_create_group_album'),
          block('onebot_delete_group_album'),
          block('onebot_upload_group_album'),
        ]),
      ]),

      // ========== 好友管理 ==========
      category('好友', 'user_category', [
        block('user_get_friends'),
        block('user_set_remark'),
        block('user_poke'),
        subCategory('好友管理', 'user_category', [
          block('onebot_get_stranger_info'),
          block('onebot_get_friend_list'),
          block('onebot_get_friends_with_category'),
          block('onebot_delete_friend'),
          block('onebot_set_friend_remark'),
          block('onebot_set_friend_category'),
        ]),
        subCategory('个人资料', 'user_category', [
          block('onebot_get_profile_like'),
          block('onebot_get_profile_like_me'),
          block('onebot_get_qq_avatar'),
          block('onebot_set_qq_avatar'),
          block('onebot_set_qq_profile'),
          block('onebot_get_robot_uin_range'),
          block('onebot_friend_poke'),
        ]),
      ]),

      // ========== 请求处理 ==========
      category('请求', 'request_category', [
        block('request_approve_friend'),
        block('request_approve_group'),
        subCategory('请求处理', 'request_category', [
          block('onebot_set_friend_add_request'),
          block('onebot_set_group_add_request'),
          block('onebot_get_doubt_friends_add_request'),
          block('onebot_set_doubt_friends_add_request'),
        ]),
      ]),

      // ========== 数据操作 ==========
      category('数据', 'data_category', [
        subCategory('变量与存储', 'data_category', [
          block('storage_set'),
          block('storage_get'),
          block('storage_delete'),
          block('variables_set'),
          block('variables_get'),
        ]),
        subCategory('JSON处理', 'data_category', [
          block('json_encode'),
          block('json_decode'),
          block('json_get'),
          block('json_extract'),
          block('table_to_json'),
        ]),
        subCategory('类型转换', 'data_category', [
          block('convert_to_string'),
          block('convert_to_number'),
          block('is_type'),
          block('safe_get'),
        ]),
      ]),

      // ========== 逻辑控制 ==========
      category('逻辑', 'logic_category', [
        subCategory('条件判断', 'logic_category', [
          block('controls_if'),
          block('logic_if_else'),
          block('logic_compare'),
          block('logic_operation'),
          block('logic_negate'),
        ]),
        subCategory('布尔值', 'logic_category', [
          block('logic_boolean'),
          block('logic_null'),
        ]),
      ]),

      // ========== 循环 ==========
      category('循环', 'loop_category', [
        subCategory('基础循环', 'loop_category', [
          block('controls_repeat_ext'),
          block('controls_whileUntil'),
        ]),
        subCategory('遍历循环', 'loop_category', [
          block('controls_for'),
          block('controls_forEach'),
        ]),
        subCategory('循环控制', 'loop_category', [
          block('controls_flow_statements'),
        ]),
      ]),

      // ========== 文本 ==========
      category('文本', 'text_category', [
        subCategory('基础文本', 'text_category', [
          block('text'),
          block('text_join'),
          block('text_concat'),
          block('text_concat_three'),
          block('text_concat_four'),
          block('concat_strings'),
          block('text_newline'),
          block('text_length'),
          block('text_isEmpty'),
        ]),
        subCategory('文本提取', 'text_category', [
          block('text_substring'),
          block('text_charAt'),
          block('text_getSubstring'),
        ]),
        subCategory('文本查找替换', 'text_category', [
          block('text_indexOf'),
          block('text_replace'),
        ]),
        subCategory('文本转换', 'text_category', [
          block('text_changeCase'),
          block('text_trim'),
          block('text_template'),
        ]),
      ]),

      // ========== 数学 ==========
      category('数学', 'math_category', [
        subCategory('基础运算', 'math_category', [
          block('math_number'),
          block('math_arithmetic'),
          block('math_modulo'),
        ]),
        subCategory('数学函数', 'math_category', [
          block('math_single'),
          block('math_trig'),
          block('math_round'),
        ]),
        subCategory('随机数', 'math_category', [
          block('math_random_int'),
          block('math_random_float'),
        ]),
        subCategory('常量', 'math_category', [
          block('math_constant'),
        ]),
      ]),

      // ========== 列表 ==========
      category('列表', 'list_category', [
        subCategory('创建列表', 'list_category', [
          block('lists_create_with'),
          block('lists_repeat'),
        ]),
        subCategory('列表查询', 'list_category', [
          block('lists_length'),
          block('lists_isEmpty'),
          block('lists_indexOf'),
        ]),
        subCategory('列表操作', 'list_category', [
          block('lists_getIndex'),
          block('lists_setIndex'),
          block('lists_getSublist'),
          block('lists_sort'),
        ]),
      ]),

      // ========== HTTP请求 ==========
      category('HTTP', 'http_category', [
        subCategory('简单请求', 'http_category', [
          block('http_get'),
          block('http_post'),
        ]),
        subCategory('高级请求', 'http_category', [
          block('http_request'),
          block('http_download_base64'),
        ]),
      ]),

      // ========== 文件操作 ==========
      category('文件', 'file_category', [
        subCategory('本地文件', 'file_category', [
          block('file_read'),
          block('file_write'),
          block('file_delete'),
          block('file_exists'),
          block('file_mkdir'),
        ]),
        subCategory('群文件', 'file_category', [
          block('file_upload_group'),
          block('file_delete_group'),
          block('file_get_group_system_info'),
          block('file_get_group_root'),
        ]),
        subCategory('文件上传', 'file_category', [
          block('onebot_upload_group_file'),
          block('onebot_upload_private_file'),
        ]),
        subCategory('文件管理', 'file_category', [
          block('onebot_delete_group_file'),
          block('onebot_delete_group_folder'),
          block('onebot_create_group_file_folder'),
          block('onebot_rename_group_file_folder'),
          block('onebot_move_group_file'),
          block('onebot_set_group_file_forever'),
        ]),
        subCategory('文件查询', 'file_category', [
          block('onebot_get_group_file_url'),
          block('onebot_get_private_file_url'),
          block('onebot_get_flash_file_info'),
          block('onebot_download_file'),
        ]),
      ]),



      // ========== 时间日期 ==========
      category('时间', 'time_category', [
        subCategory('获取时间', 'time_category', [
          block('system_timestamp_seconds'),
          block('system_timestamp_milliseconds'),
          block('system_now'),
        ]),
      ]),

      // ========== 工具 ==========
      category('工具', 'utils_category', [
        subCategory('编码解码', 'utils_category', [
          block('utils_url_encode'),
          block('utils_url_decode'),
          block('utils_base64_encode'),
          block('utils_base64_decode'),
          block('utils_html_escape'),
          block('utils_html_unescape'),
        ]),
      ]),

      // ========== 日志 ==========
      category('日志', 'log_category', [
        block('log_output'),
        block('log_info'),
        block('log_warn'),
        block('log_error'),
        block('log_debug'),
      ]),

      // ========== 系统 ==========
      category('系统', 'system_category', [
        subCategory('系统信息', 'system_category', [
          block('system_timestamp_seconds'),
          block('system_timestamp_milliseconds'),
          block('system_now'),
          block('system_status'),
        ]),
        subCategory('插件控制', 'system_category', [
          block('plugin_unload_self'),
          block('plugin_stop_self'),
          block('plugin_reload_self'),
        ]),
        subCategory('系统信息', 'system_category', [
          block('onebot_get_login_info'),
          block('onebot_get_version_info'),
          block('onebot_get_status'),
          block('onebot_get_cookies'),
          block('onebot_get_rkey'),
        ]),
        subCategory('系统操作', 'system_category', [
          block('onebot_set_online_status'),
          block('onebot_set_restart'),
          block('onebot_clean_cache'),
          block('onebot_scan_qrcode'),
          block('onebot_ocr_image'),
        ]),
      ]),

      // ========== 机器人信息 ==========
      category('机器人', 'bot_category', [
        block('bot_get_login_info'),
        block('bot_get_status'),
        block('bot_get_version'),
      ]),

      // ========== 注释 ==========
      category('注释', 'comment_category', [
        block('comment_text'),
        block('comment_block'),
      ]),

      // ========== 函数 ==========
      {
        kind: 'category',
        name: '函数',
        categorystyle: 'function_category',
        custom: 'PROCEDURE',
      },

      // ========== 高级 ==========
      category('高级', 'advanced_category', [
        subCategory('API调用', 'advanced_category', [
          block('api_call_with_result'),
        ]),
      ]),
    ],
  };
}

// 搜索积木块的工具函数
export function searchBlocks(searchTerm: string): any[] {
  const allBlocks = getToolboxCategories().contents;
  const results: any[] = [];

  function searchInCategory(category: any) {
    if (category.contents) {
      for (const item of category.contents) {
        if (item.kind === 'block') {
          // 检查积木类型是否匹配搜索词
          if (item.type.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push(item);
          }
        } else if (item.kind === 'category') {
          searchInCategory(item);
        }
      }
    }
  }

  for (const category of allBlocks) {
    searchInCategory(category);
  }

  return results;
}
