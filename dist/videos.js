/* 培训视频设置
 * 默认：把视频文件放进网页旁边的 videos/ 文件夹，文件名与下面的编号一致，例如 videos/IMG_5930_01_Equipment_and_Introduction.mp4。
 * 文件不存在时页面显示占位框（标出应放的文件名），不影响训练流程。
 * 也可以在 files 里给某段视频指定完整网址（需要是浏览器能直接播放的 mp4 / webm 链接）。
 *
 * QC 质控（IMG_5930）：01 设备与介绍 · 02 选择质控测试与等级 · 03 质控液与试纸批次核对 · 04 加质控液 · 05 质控结果与完成
 * 患者测试（IMG_5929）：01 设备与介绍 · 02 开机与操作者登录 · 03 患者身份识别 · 04 试纸批次核对 · 05 试纸与血样 · 06 血糖结果显示 · 07 结果评论与完成
 */
window.TRAINING_VIDEOS = {
  base: 'videos/',
  ext: '.mp4',
  posters: true,   // 每段视频旁边的同名 .jpg 作为封面（没有也不影响播放）
  files: {
    // 'IMG_5930_01_Equipment_and_Introduction': 'https://example.org/videos/qc01.mp4',
  },
};
