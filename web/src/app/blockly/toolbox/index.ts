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
    name,
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
      category('快速开始', 'popular_category', [
        block('event_on_message'),
        block('msg_get_simple_field'),
        block('msg_get_text_content'),
        block('msg_contains_text'),
        block('message_send_group'),
        block('message_send_private'),
        block('log_info'),
        block('storage_set'),
        block('storage_get'),
        block('logic_if_else'),
        block('variables_set'),
        block('variables_get'),
      ]),

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
        subCategory('群事件', 'event_category', [
          block('event_on_group_admin'),
          block('event_on_group_member_increase'),
          block('event_on_group_member_decrease'),
          block('event_on_group_ban'),
          block('event_on_group_recall'),
          block('event_on_group_card'),
          block('event_on_group_title'),
          block('event_on_group_msg_emoji_like'),
          block('event_on_group_upload'),
          block('event_on_group_request'),
        ]),
        subCategory('好友事件', 'event_category', [
          block('event_on_friend_recall'),
          block('event_on_friend_add'),
          block('event_on_friend_request'),
        ]),
        subCategory('互动事件', 'event_category', [
          block('event_on_poke'),
          block('event_on_essence'),
        ]),
        subCategory('机器人状态', 'event_category', [
          block('event_on_bot_status'),
        ]),
      ]),

      category('消息', 'message_category', [
        subCategory('读取消息', 'message_category', [
          block('msg_get_simple_field'),
          block('msg_get_text_content'),
          block('msg_get_sender_id'),
          block('msg_get_sender_nickname'),
          block('msg_get_group_id'),
          block('msg_get_time'),
          block('msg_get_message_id'),
          block('msg_get_images'),
          block('msg_get_first_image'),
          block('msg_get_at_users'),
          block('msg_get_reply_info'),
          block('msg_get_reply_id'),
          block('message_get_reply_id'),
          block('message_get_sender_role'),
        ]),
        subCategory('消息判断', 'message_category', [
          block('msg_contains_text'),
          block('msg_contains_keyword'),
          block('msg_is_group'),
          block('msg_is_private'),
          block('msg_is_type'),
          block('msg_has_json'),
          block('msg_is_contact_card'),
          block('msg_is_group_card'),
          block('msg_is_channel_card'),
          block('msg_has_image'),
          block('msg_has_voice'),
          block('msg_has_video'),
          block('msg_has_face'),
          block('msg_is_at_bot'),
          block('msg_is_at_all'),
          block('msg_has_url'),
          block('message_is_sender_owner'),
          block('message_is_sender_admin'),
          block('message_is_sender_member'),
          block('message_has_reply'),
        ]),
        subCategory('卡片解析', 'message_category', [
          block('msg_get_json_data'),
          block('msg_parse_card'),
          block('msg_parse_card_full'),
          block('msg_get_card_field'),
          block('msg_get_card_id_from_url'),
          block('msg_get_json_app_type'),
          block('msg_get_json_field'),
          block('msg_json_has_app'),
        ]),
        subCategory('URL链接', 'message_category', [
          block('msg_count_urls'),
          block('msg_get_urls'),
        ]),
        subCategory('发送消息', 'message_category', [
          block('message_send_group'),
          block('message_send_private'),
          block('message_reply_group'),
          block('message_reply_private'),
          block('send_group_image_base64'),
          block('send_private_image_base64'),
        ]),
        subCategory('发送消息(存结果)', 'message_category', [
          block('message_send_group_with_var'),
          block('message_send_private_with_var'),
          block('onebot_send_group_msg_with_var'),
          block('onebot_send_private_msg_with_var'),
        ]),
        subCategory('消息管理', 'message_category', [
          block('message_delete'),
          block('message_set_essence'),
          block('message_get_essence_list'),
          block('message_send_like'),
          block('onebot_mark_msg_as_read'),
          block('onebot_set_msg_emoji_like'),
          block('onebot_delete_essence_msg'),
        ]),
        subCategory('消息管理(存结果)', 'message_category', [
          block('onebot_delete_msg_with_var'),
          block('onebot_set_essence_msg_with_var'),
          block('onebot_send_like_with_var'),
          block('onebot_mark_msg_as_read_with_var'),
          block('onebot_set_msg_emoji_like_with_var'),
          block('onebot_delete_essence_msg_with_var'),
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
        subCategory('消息查询(存结果)', 'message_category', [
          block('onebot_get_msg_with_var'),
          block('onebot_get_forward_msg_with_var'),
          block('onebot_get_group_msg_history_with_var'),
          block('onebot_get_friend_msg_history_with_var'),
        ]),
        subCategory('消息转发', 'message_category', [
          block('onebot_forward_group_single_msg'),
          block('onebot_forward_friend_single_msg'),
          block('onebot_voice_msg_to_text'),
        ]),
        subCategory('消息转发(存结果)', 'message_category', [
          block('onebot_forward_group_single_msg_with_var'),
          block('onebot_forward_friend_single_msg_with_var'),
        ]),
        subCategory('AI语音', 'message_category', [
          block('onebot_send_group_ai_record'),
          block('onebot_get_ai_characters'),
        ]),
      ]),

      category('群组', 'group_category', [
        subCategory('群信息', 'group_category', [
          block('group_get_list'),
          block('group_get_members'),
          block('onebot_get_group_info'),
          block('onebot_get_group_member_info'),
          block('onebot_get_group_honor_info'),
          block('onebot_get_group_at_all_remain'),
          block('onebot_get_group_shut_list'),
        ]),
        subCategory('群信息(存结果)', 'group_category', [
          block('onebot_get_group_info_with_var'),
          block('onebot_get_group_member_info_with_var'),
          block('onebot_get_group_member_list_with_var'),
          block('onebot_get_group_list_with_var'),
        ]),
        subCategory('成员管理', 'group_category', [
          block('group_kick'),
          block('group_set_ban'),
          block('group_set_card'),
          block('group_set_admin'),
          block('group_poke'),
          block('msg_is_group_admin'),
          block('onebot_set_group_leave'),
          block('onebot_set_group_special_title'),
          block('onebot_batch_delete_group_member'),
        ]),
        subCategory('成员管理(存结果)', 'group_category', [
          block('onebot_set_group_kick_with_var'),
          block('onebot_set_group_ban_with_var'),
          block('onebot_set_group_card_with_var'),
          block('onebot_set_group_admin_with_var'),
          block('onebot_set_group_leave_with_var'),
          block('onebot_set_group_special_title_with_var'),
        ]),
        subCategory('群设置', 'group_category', [
          block('group_set_whole_ban'),
          block('group_set_name'),
          block('onebot_set_group_remark'),
          block('onebot_set_group_msg_mask'),
          block('onebot_send_group_sign'),
        ]),
        subCategory('群设置(存结果)', 'group_category', [
          block('onebot_set_group_whole_ban_with_var'),
          block('onebot_set_group_name_with_var'),
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

      category('用户', 'user_category', [
        subCategory('好友管理', 'user_category', [
          block('user_get_friends'),
          block('user_set_remark'),
          block('user_poke'),
          block('onebot_get_stranger_info'),
          block('onebot_get_friend_list'),
          block('onebot_get_friends_with_category'),
          block('onebot_delete_friend'),
          block('onebot_set_friend_remark'),
          block('onebot_set_friend_category'),
          block('onebot_friend_poke'),
        ]),
        subCategory('好友管理(存结果)', 'user_category', [
          block('onebot_get_stranger_info_with_var'),
          block('onebot_get_friend_info_with_var'),
          block('onebot_get_friend_list_with_var'),
          block('onebot_delete_friend_with_var'),
          block('onebot_set_friend_remark_with_var'),
          block('onebot_friend_poke_with_var'),
          block('onebot_set_friend_category_with_var'),
        ]),
        subCategory('个人资料', 'user_category', [
          block('onebot_get_profile_like'),
          block('onebot_get_profile_like_me'),
          block('onebot_get_qq_avatar'),
          block('onebot_set_qq_avatar'),
          block('onebot_set_qq_profile'),
          block('onebot_get_robot_uin_range'),
        ]),
        subCategory('个人资料(存结果)', 'user_category', [
          block('onebot_set_qq_profile_with_var'),
        ]),
      ]),

      category('请求处理', 'request_category', [
        block('request_approve_friend'),
        block('request_approve_group'),
        subCategory('处理请求', 'request_category', [
          block('onebot_set_friend_add_request'),
          block('onebot_set_group_add_request'),
          block('onebot_get_doubt_friends_add_request'),
          block('onebot_set_doubt_friends_add_request'),
        ]),
        subCategory('处理请求(存结果)', 'request_category', [
          block('onebot_set_friend_add_request_with_var'),
          block('onebot_set_group_add_request_with_var'),
        ]),
      ]),

      category('数据', 'data_category', [
        subCategory('变量', 'data_category', [
          block('variables_set'),
          block('variables_get'),
        ]),
        subCategory('持久存储', 'data_category', [
          block('storage_set'),
          block('storage_get'),
          block('storage_delete'),
        ]),
        subCategory('JSON处理', 'data_category', [
          block('json_encode'),
          block('json_decode'),
          block('json_get'),
          block('json_extract'),
          block('table_to_json'),
          block('table_get'),
          block('table_set'),
        ]),
        subCategory('类型转换', 'data_category', [
          block('convert_to_string'),
          block('convert_to_number'),
          block('is_type'),
          block('safe_get'),
        ]),
        subCategory('数据库', 'database_category', [
          block('simple_db_set'),
          block('simple_db_get'),
          block('simple_db_delete'),
        ]),
      ]),

      category('逻辑', 'logic_category', [
        subCategory('条件判断', 'logic_category', [
          block('controls_if'),
          block('logic_if_else'),
          block('logic_compare'),
          block('logic_compare_hex'),
          block('logic_operation'),
          block('logic_negate'),
        ]),
        subCategory('布尔值', 'logic_category', [
          block('logic_boolean'),
          block('logic_null'),
        ]),
      ]),

      category('循环', 'loop_category', [
        subCategory('重复执行', 'loop_category', [
          block('controls_repeat_ext'),
          block('controls_whileUntil'),
        ]),
        subCategory('遍历', 'loop_category', [
          block('controls_for'),
          block('controls_forEach'),
        ]),
        subCategory('循环控制', 'loop_category', [
          block('controls_flow_statements'),
        ]),
      ]),

      category('文本', 'text_category', [
        subCategory('创建文本', 'text_category', [
          block('text'),
          block('text_join'),
          block('text_concat'),
          block('text_concat_three'),
          block('text_concat_four'),
          block('concat_strings'),
          block('text_newline'),
        ]),
        subCategory('文本属性', 'text_category', [
          block('text_length'),
        ]),
        subCategory('文本提取', 'text_category', [
          block('text_substring'),
          block('text_count_occurrences'),
          block('text_contains'),
        ]),
        subCategory('查找替换', 'text_category', [
          block('text_replace_custom'),
        ]),
        subCategory('文本转换', 'text_category', [
          block('text_changeCase'),
          block('text_trim'),
          block('text_template'),
        ]),
      ]),

      category('数学', 'math_category', [
        subCategory('数值', 'math_category', [
          block('math_number'),
        ]),
        subCategory('基础运算', 'math_category', [
          block('math_arithmetic'),
          block('math_modulo'),
        ]),
        subCategory('数学函数', 'math_category', [
          block('math_single'),
          block('math_trig'),
          block('math_round'),
          block('format_number'),
        ]),
        subCategory('随机数', 'math_category', [
          block('math_random_int'),
          block('math_random_float'),
        ]),
        subCategory('常量', 'math_category', [
          block('math_constant'),
        ]),
      ]),

      category('列表', 'list_category', [
        subCategory('创建列表', 'list_category', [
          block('lists_create_with'),
          block('lists_repeat'),
        ]),
        subCategory('列表属性', 'list_category', [
          block('lists_length'),
          block('lists_isEmpty'),
        ]),
        subCategory('查找元素', 'list_category', [
          block('lists_indexOf'),
        ]),
        subCategory('获取元素', 'list_category', [
          block('lists_getIndex'),
          block('lists_getSublist'),
        ]),
        subCategory('修改列表', 'list_category', [
          block('lists_setIndex'),
          block('lists_sort'),
        ]),
      ]),

      category('网络请求', 'http_category', [
        subCategory('HTTP请求', 'http_category', [
          block('http_get'),
          block('http_post'),
          block('http_request'),
        ]),
        subCategory('HTTP请求(存结果)', 'http_category', [
          block('http_get_with_var'),
          block('http_post_with_var'),
        ]),
        subCategory('文件下载', 'http_category', [
          block('http_download_base64'),
          block('onebot_download_file'),
        ]),
      ]),

      category('文件', 'file_category', [
        subCategory('本地文件', 'file_category', [
          block('file_read'),
          block('file_write'),
          block('file_delete'),
          block('file_exists'),
          block('file_mkdir'),
        ]),
        subCategory('群文件上传', 'file_category', [
          block('file_upload_group'),
          block('onebot_upload_group_file'),
          block('onebot_upload_private_file'),
        ]),
        subCategory('群文件上传(存结果)', 'file_category', [
          block('onebot_upload_group_file_with_var'),
          block('onebot_upload_private_file_with_var'),
        ]),
        subCategory('群文件管理', 'file_category', [
          block('file_delete_group'),
          block('file_get_group_system_info'),
          block('file_get_group_root'),
          block('onebot_delete_group_file'),
          block('onebot_delete_group_folder'),
          block('onebot_create_group_file_folder'),
          block('onebot_rename_group_file_folder'),
          block('onebot_move_group_file'),
          block('onebot_set_group_file_forever'),
        ]),
        subCategory('群文件管理(存结果)', 'file_category', [
          block('onebot_delete_group_file_with_var'),
          block('onebot_delete_group_folder_with_var'),
          block('onebot_create_group_file_folder_with_var'),
        ]),
        subCategory('文件链接', 'file_category', [
          block('onebot_get_group_file_url'),
          block('onebot_get_private_file_url'),
          block('onebot_get_flash_file_info'),
        ]),
      ]),

      category('时间', 'time_category', [
        subCategory('系统时间', 'time_category', [
          block('system_timestamp_seconds'),
          block('system_timestamp_milliseconds'),
          block('system_now'),
        ]),
        subCategory('获取时间单位', 'time_category', [
          block('time_get_year'),
          block('time_get_month'),
          block('time_get_day'),
          block('time_get_hour'),
          block('time_get_minute'),
          block('time_get_second'),
          block('time_get_weekday'),
          block('time_get_weekday_name'),
        ]),
        subCategory('格式化日期', 'time_category', [
          block('time_format_date'),
          block('time_format_time'),
          block('time_format_datetime'),
        ]),
        subCategory('时间戳转换', 'time_category', [
          block('time_timestamp_to_date'),
          block('time_date_to_timestamp'),
        ]),
        subCategory('时间计算', 'time_category', [
          block('time_add_unit'),
          block('time_diff'),
          block('time_is_leap_year'),
          block('time_days_in_month'),
          block('time_start_of_day'),
          block('time_end_of_day'),
        ]),
        subCategory('定时任务', 'time_category', [
          block('schedule_interval_seconds'),
          block('schedule_interval_minutes'),
          block('schedule_interval_hours'),
          block('schedule_daily'),
          block('schedule_weekly'),
          block('schedule_monthly'),
        ]),
      ]),

      category('日志', 'log_category', [
        block('log_output'),
        block('log_info'),
        block('log_warn'),
        block('log_error'),
        block('log_debug'),
      ]),

      category('编码工具', 'utils_category', [
        subCategory('URL编码', 'utils_category', [
          block('utils_url_encode'),
          block('utils_url_decode'),
        ]),
        subCategory('Base64编码', 'utils_category', [
          block('utils_base64_encode'),
          block('utils_base64_decode'),
        ]),
        subCategory('HTML转义', 'utils_category', [
          block('utils_html_escape'),
          block('utils_html_unescape'),
        ]),
        subCategory('URL/域名处理', 'utils_category', [
          block('url_extract_domain'),
          block('url_extract_tld'),
        ]),
      ]),

      category('系统', 'system_category', [
        subCategory('机器人信息', 'system_category', [
          block('bot_get_login_info'),
          block('bot_get_status'),
          block('bot_get_version'),
          block('onebot_get_login_info'),
          block('onebot_get_version_info'),
          block('onebot_get_status'),
        ]),
        subCategory('机器人信息(存结果)', 'system_category', [
          block('onebot_get_login_info_with_var'),
          block('onebot_get_version_info_with_var'),
          block('onebot_get_status_with_var'),
        ]),
        subCategory('系统操作', 'system_category', [
          block('system_status'),
          block('onebot_get_cookies'),
          block('onebot_get_rkey'),
          block('onebot_set_online_status'),
          block('onebot_set_restart'),
          block('onebot_clean_cache'),
        ]),
        subCategory('系统操作(存结果)', 'system_category', [
          block('onebot_get_cookies_with_var'),
        ]),
        subCategory('图像识别', 'system_category', [
          block('onebot_scan_qrcode'),
          block('onebot_ocr_image'),
          block('onebot_fetch_custom_face'),
          block('onebot_get_recommend_face'),
          block('message_image_has_qrcode'),
          block('message_image_count_qrcodes'),
          block('message_image_get_qrcodes'),
        ]),
        subCategory('安全检查', 'system_category', [
          block('onebot_check_url_safely'),
        ]),
        subCategory('高级功能', 'system_category', [
          block('onebot_send_pb'),
        ]),
      ]),

      category('注释', 'comment_category', [
        block('comment_text'),
        block('comment_block'),
      ]),

      category('高级', 'advanced_category', [
        block('lua_custom_code'),
        block('json_config_input'),
      ]),

      category('函数', 'function_category', [
        block('simple_function_def'),
        block('simple_function_call'),
      ]),

      category('高级API', 'advanced_category', [
        subCategory('API调用', 'advanced_category', [
          block('api_call_with_result'),
          block('api_call_with_var'),
          block('api_get_retcode'),
          block('api_is_success'),
        ]),
      ]),
    ],
  };
}

export function searchBlocks(searchTerm: string): any[] {
  const allBlocks = getToolboxCategories().contents;
  const results: any[] = [];

  function searchInCategory(category: any) {
    if (category.contents) {
      for (const item of category.contents) {
        if (item.kind === 'block') {
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
