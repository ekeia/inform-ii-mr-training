/* Inform II MR 培训 — 两门课程（QC 质控 / 患者血糖）：流程引擎 + 页面
 * 数据：course-qc.js、course-patient.js（流程图步骤 → 小步骤）  视频：videos.js
 * 识别：infer-worker.js（检测 → 裁切 → 清晰度 → 13 类分类）
 * 通过规则：清晰度 ≥ 0.004 才计帧；最高类是目标界面且概率 ≥ 阈值（默认 0.7）；连续 N 帧（默认 3，照片 1）。
 * 页面流程：首页（选课程、模式）→ 每段视频导入 → 一步一步（每步拆成小步骤，一次只做一件事）→ 课程回顾。
 */
(() => {
'use strict';
const COURSES = window.COURSES;
const CLASSES = ['00_control_level_mismatch', '01_qc_level_selection', '02a_control_insert_strip', '02b_control_apply_drop',
  '03_control_test_feedback', '04_control_test_result', '05_main_menu', '06_operator_id', '07_patient_id',
  '08_patient_test_insert_strip', '11_patient_test_result', '12a_use_control_lot', '12b_strip_lots'];
const READ_MIN = 0.004, LEVELS = ['L1', 'L2'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------------- i18n ---------------- */
const TXT = {
  zh: {
    appTitle: '血糖仪 MR 培训', lnTitle: 'ACCU-CHEK Inform II · MR 培训', lnSub: 'QC 质控测试与患者血糖测试 · 用 Meta Quest 3／3S 浏览器打开', lnInMr: 'MR 进行中。退出 MR 后回到这里，进度会保留。', lnNote: '进入 MR 后先在开始页面选择测试；每一轮结束都会自动回到开始页面。没有摄像头时，识别步骤可用「讲师放行」。', lnHow1: '每段开头自动播放示范视频', lnHow2: '照着设备操作，屏幕自动识别', lnHow3: '识别通过后点视野里的绿色卡片确认', lnHow4: '一轮结束自动回到开始页面', lnModel: '识别模型', lnSettings: '设置', settings: '设置', arStart: '进入 AR / MR', vision: '设备与屏幕识别', srcSim: '模拟设备', srcPhoto: '照片', srcCam: '摄像头',
    setLevels: 'QC 课程：本次需要完成的质控等级', setTh: '通过所需置信度', setHold: '连续帧数', setAuto: '本步全部完成后自动进入下一步', setConfirm: '屏幕识别通过后，确认再进入下一步', setProbs: '显示全部 13 类概率',
    setNote: '识别规则：看得清（清晰度 ≥ 0.004）才计帧；最高的类别是本步目标界面且置信度达标；摄像头要连续 N 帧，照片单张即可。', resetRun: '重新开始本课程', close: '完成',
    arExit: '退出', rescanShort: '重扫', override: '讲师放行', prepTitle: '进入 MR 前', prepIntro: 'Quest 浏览器在 MR 里不提供摄像头画面给网页，需要先在这里打开摄像头。之后在头显里会看到一块可移动的 3D 面板。',
    prepStep1: '允许使用头显摄像头（用于识别设备屏幕）', prepStep2: '进入 MR（手柄射线或手势捏合点击面板）', prepCamBtn: '允许摄像头', mrStart: '进入 MR',
    camState_idle: '未开启', camState_asking: '请求中…', camState_on: '已开启', camState_denied: '被拒绝', camState_error: '不可用',
    // home
    homeEyebrow: 'ACCU-CHEK Inform II · 护理操作培训', homeTitle: '血糖仪 MR 操作培训',
    homeLead: '两门课程，按设备的真实界面一步一步学。每一段先看示范视频，再跟着小步骤在真机或模拟设备上操作：能识别的屏幕自动打勾，设备看不到的动作由你确认、护士核对。',
    recFirst: '建议先学', needQC: '先通过 QC 才能测患者', fSteps: '流程步骤', fMicro: '小步骤', fVideos: '视频片段', fMin: '分钟（约）',
    covAuto: n => `${n} 步自动识别屏幕`, covManual: n => `${n} 步人工确认`, startLearn: '学习模式开始', startExam: '考核模式', cont: n => `继续 · 第 ${pad(n)} 步`, contDone: '查看回顾',
    restartLearn: '重新开始（学习）', fullVideo: '▶ 完整示范视频', progTxt: (a, b) => `已完成 ${a} / ${b} 步`,
    howTitle: '怎么学', how: [['看视频', '每一段开始前先看这一段的示范视频。'], ['照着设备做', '在设备上操作，屏幕变到下一页时自动识别、自动完成，完成后自动进入下一步。'], ['只在必要时点', '设备看不到的动作（核对瓶身、混匀、手卫生等）每步合成一张清单，做完点一次「已完成」；当场确认不了点「待确认」。'], ['回顾', '每门课结束都有回顾：用时、异常、重测、待护士核对的项目，可以复制报告。']],
    modesTitle: '两种模式', modeLearn: '学习', modeExam: '考核', modeLearnT: '学习模式', modeExamT: '考核模式',
    modeLearnD: '视频、详细说明、提示和屏幕示意全部打开，适合第一次学。', modeExamD: '不放视频，小步骤只显示标题；需要时点「提示」查看说明，提示次数计入回顾。',
    rulesTitle: '训练原则', rules: ['MR 负责操作引导与训练反馈；设备负责测量，并显示实际状态。AH／医院流程及实际配置决定相应处理。', '设备不能检测的物理动作，不因界面前进而自动通过；无法确认的动作标为「待确认」，由护士核对。', '界面示例数值、日期和批次不是临床规则；不新增阈值、混匀次数或设备不保证的错误。'],
    // intro
    introEyebrow: (n, m) => `第 ${n} 段 / 共 ${m} 段`, learnTitle: '这一段你会学到', watchTitle: '看视频时留意', warnTitle: '注意', stepsTitle: '本段步骤',
    startModule: n => `开始第 ${pad(n)} 步 →`, backToStepN: n => `回到第 ${pad(n)} 步 →`, vidPending: '视频待上传（占位）', vidWatched: '已观看', vidSegs: n => `${n} 段视频`, microN: n => `${n} 个小步骤`,
    // lesson
    watchBtn: '▶ 本段视频', moduleN: n => `第 ${n} 段`, msTitle: (a, b) => `小步骤 ${a} / ${b}`,
    kinds: { prep: '准备', do: '操作', scan: '扫描', look: '看屏幕', wait: '等待', check: '核对', choose: '判断', safe: '安全' },
    doneBtn: '做好了', undo: '撤销', ckOk: '已完成', ckPend: '待确认', ckNote: '当场无法确认就点「待确认」，由护士在回顾里核对。',
    seeBtn: '看到了', seeNote: '这个界面没有训练数据，看到后点「看到了」；模拟设备显示时会自动确认。',
    stTap: '已确认', stSim: '模拟设备已显示此界面', stCls: '屏幕识别已确认', stLater: '已越过（后面的界面已识别）', stOk: '已完成', stPend: '待确认（护士核对）',
    visWait: '等待识别', visDone: p => `已识别 ${p}%`, visKnown: '模拟设备：已知画面（示意图，不经识别）', visShared: x => `已随 ${x} 一并识别`, visOvr: '讲师放行',
    visTarget: x => `屏幕出现「${x}」`, visSeq: (a, b) => `先「${a}」，再回到「${b}」`, visHalf: a => `✓ 已识别「${a}」`, rescan: '重置识别',
    skipNote: (x, a, b) => `沙漏／测量页不检测：识别到「${x}」即视为 ${a}、${b} 两步完成。`,
    levelTitle: '本轮质控等级', pass: 'PASS／范围内', fail: 'FAIL／超范围',
    decRight: '判断正确。', decWrong: x => `判断有误：屏幕显示的是 ${x}。请重新判断。`, catRight: '判断正确。', catWrong: '判断与屏幕上的结果不符，请复核数值与标记后重新选择。', catLive: '实机结果：判断由讲师复核。',
    remainLeft: x => `还需完成：${x}。完成本步后回到 QC 03（新试纸）。`, remainNone: '所需等级已全部通过。完成本步后进入清理。',
    hint: '提示', hintUsed: '已看提示', stepDone: '本步完成', next: '下一步', prev: '上一步', toReview: '完成并查看回顾', nextLevel: '下一等级 → QC 03', retest: '重测 → QC 03（新试纸）',
    moreTitle: '如果出现这些情况', record: '发生了这个情况', kRetry: '纠正／重试', kStop: '停止／升级', kConfirm: '待确认', kOk: '正常／可选',
    refTitle: '本步参考', refAction: '流程图操作', refPass: '通过标准', refMr: 'MR 话术', refPage: '说明书', refPageV: n => `Operator's Manual v8.0 · 第 ${n} 页`, refVision: '屏幕识别', refScreens: '界面变化',
    refVisionNone: '本步不做屏幕识别：设备界面不变或没有训练数据，靠人工确认。',
    blockTitle: '停止／升级：未解决前不恢复常规测试', resolveGo: x => `已处理，返回 ${x}`, resolveContinue: '记录并继续', escalateEnd: '升级并结束训练', approvedResume: '已获准，按医院流程恢复', support: '持续错误：联系支持并结束训练',
    goCourse: x => `去学「${x}」`, backFromQC: x => `QC 已完成 → 返回${x}`, pendingReturn: x => `患者课程停在 ${x}（QC Lockout）：完成 QC 后可以直接回去。`,
    // meter
    now: '当前识别', target: '本步目标', targetSee: x => `人工确认：${x}`, noTarget: '本步不识别屏幕', unreadable: '反光或模糊，看不清（已跳过此帧）', noScreen: '画面里没有找到设备屏幕',
    loading: '模型加载中…', clsReady: '分类就绪 · 检测加载中…', ready: '模型就绪', modelErr: x => '模型加载失败：' + x, readability: '清晰度', det: '检测',
    isStart: (x, y) => `「${x}」是本步的起始界面；完成操作后应出现「${y}」。`, notThisStep: x => `当前是「${x}」，不是本步的目标界面。`,
    tagSynth: '示意画面', tagMan: '说明书示意图', tagFail: '示意：FAIL 画面由真实结果页改绘', synthNote: '示意画面：模型没有学过这个界面，不参与识别。', knownNote: x => `示意图：模拟设备直接按已知画面判定为「${x}」。`,
    fallbackNote: '识别模型在此环境无法运行：模拟设备按已知显示的画面判定；照片、摄像头请用「讲师放行」。',
    note01: '患者流程里没有质控等级页：这很可能是 Power Up 或「Use Strip Lot?」提示。模型没学过这两页，会把它们认成质控等级选择。',
    note00: '红叉错误弹窗都会被认成 Control Level Mismatch（训练数据里唯一的错误弹窗）。以设备上的实际文字为准。',
    // simulator
    simPower: '开机', simContinue: '继续 ▶', simNotReady: '状态异常', simFixed: '处理后 ✓', simScanId: '扫描本人 ID', simNoRead: '条码 10 秒未读到', simBadId: 'ID 无效', simOk: '确认 ✓',
    simCT: '选择 Control Test', simPT: '选择 Patient Test', simPTwrong: '误选 Patient Test', simBack: '返回 ←', simL1: 'Level 1 (Lo)', simL2: 'Level 2 (Hi)', simScanCtl: '扫描对应等级的质控液', simWrongCtl: '扫了另一等级的质控液',
    simScanStrip: '扫描试纸瓶条码', simInsert: '插入试纸', simDefect: 'Strip Error', simRemove: '取出试纸', simDose: '加样到试纸前端', simInterrupt: '测量中断', simComment: '添加备注 💬', simConfirmRes: '确认结果 ✓', simOff: '关机',
    simQCLock: 'QC Lockout', simDLLock: 'Download Lockout', simMenu: '额外测试菜单', simGlucose: '选择 Glucose Test', simScanPt: '扫描患者腕带', simPidBad: 'ID 无效／未找到', simIdOk: '信息一致 ✓', simIdBad: '信息不符 ✗',
    simLotOk: '批次一致 ✓', simLotOther: '批次不同 ✗', simBlood: '血滴接触试纸前缘', simDoseErr: '加样错误', simComments: '添加评论 💬', simCmtDone: '选好评论 ✓', simOutcome: '本次测量结果：', simWait: '设备处理中…',
    outcomes: { normal: '正常 6.0', high: '偏高 ↑ 12.2', crit: '危急 CR LO', rr: 'RR HI', hilo: 'HI' },
    photoBtn: '选择或拍摄照片', photoHint: '拍一张设备屏幕的照片（整台设备入镜即可，检测模型会自己找屏幕）。', camOn: '打开摄像头', camOff: '关闭摄像头',
    camHint: '对准设备屏幕；检测模型会在整个画面里找屏幕，不需要对准框。', camNone: '此浏览器不支持摄像头', camDenied: '摄像头被拒绝或不可用（网页链接里无法使用摄像头，需部署到 HTTPS）。',
    simHint: '模拟设备显示真实拍摄的屏幕（有训练数据的界面）和说明书示意图（没有训练数据的界面）。真实画面跑分类模型；示意图不参与识别，按已知画面确认。红色按钮会触发流程图的分支。',
    arFail: '无法启动摄像头：', arOverlay: '摄像头叠加模式', arXR: 'WebXR AR', arNoCamXR: '此设备的 WebXR 不提供摄像头画面，已改用叠加模式', aim: '把设备屏幕放进画面',
    mrStartQC: '请备齐物品、开机，并扫描本人 ID 登录。', mrStartPT: '请备齐物品并开机，检查设备状态。',
    // review
    reviewTitle: '课程回顾', reviewDone: '课程完成', reviewEsc: '训练已升级停止', reviewPend: '还有待确认项，护士核对后才算完成',
    dur: '用时', stepsDone: '完成步骤', levelsLbl: '质控等级', catLbl: '结果判断', errors: '操作异常', retries: '重测／重做', ovrs: '讲师放行', pendLbl: '待确认', hintsLbl: '提示次数', modeLbl: '模式',
    colStep: '步骤', colVision: '屏幕识别', colChecks: '人工确认', colBranches: '分支', nurseOk: '护士核对确认', timeline: '错误与重试记录', noEvents: '本次训练没有触发任何分支。',
    copy: '复制报告', copied: '已复制', restart: '重新开始本课程', backToStep: x => `回到 ${x}`, toHome: '课程首页', nextCourse: x => `下一门：${x} →`,
    vAuto: (x, p) => `自动 · ${x} ${p}%`, vKnown: '模拟设备（示意图）', vSee: '人工确认', vSeeSim: '模拟设备', vSeeCls: '识别', vSeeTap: '学员确认', vOvr: '讲师放行', vShared: x => `随 ${x}`, vNone: '不识别', vNo: '未完成',
    lvPass: 'PASS', lvFail: 'FAIL', evHint: '查看提示', evWrongCat: x => `结果判断有误（选了「${x}」）`,
  },
  en: {
    appTitle: 'Meter MR Training', lnTitle: 'ACCU-CHEK Inform II · MR training', lnSub: 'QC control test and patient glucose test · open in the Meta Quest 3 / 3S browser', lnInMr: 'MR is running. Leaving MR brings you back here; progress is kept.', lnNote: 'In MR you start on the start page and choose a test; after every round you come back to it. Without a camera, use “Instructor pass” on screen steps.', lnHow1: 'Each segment opens with its demo video', lnHow2: 'Operate the meter; screens are recognised', lnHow3: 'Tap the green card in view to confirm', lnHow4: 'Back to the start page after each round', lnModel: 'Recognition model', lnSettings: 'Settings', settings: 'Settings', arStart: 'Start AR / MR', vision: 'Meter & screen recognition', srcSim: 'Simulator', srcPhoto: 'Photo', srcCam: 'Camera',
    setLevels: 'QC course: control levels required this session', setTh: 'Confidence needed to pass', setHold: 'Consecutive frames', setConfirm: 'After a screen is recognised, confirm before going on', setAuto: 'Go to the next step automatically once everything is done', setProbs: 'Show all 13 class probabilities',
    setNote: 'Rule: a frame counts only if readable (≥ 0.004); the top class must be this step’s target screen with enough confidence; the camera needs N frames in a row, a photo needs one.', resetRun: 'Restart this course', close: 'Done',
    arExit: 'Exit', rescanShort: 'Rescan', override: 'Instructor pass', prepTitle: 'Before entering MR', prepIntro: 'The Quest browser does not give camera frames to web pages inside MR, so the camera has to be opened here first. In the headset you will then see a movable 3D panel.',
    prepStep1: 'Allow the headset camera (to recognise the meter screen)', prepStep2: 'Enter MR: point and pull the trigger or pinch to tap the panel', prepCamBtn: 'Allow camera', mrStart: 'Enter MR',
    camState_idle: 'off', camState_asking: 'asking…', camState_on: 'on', camState_denied: 'denied', camState_error: 'unavailable',
    homeEyebrow: 'ACCU-CHEK Inform II · nursing skills', homeTitle: 'Glucose meter MR training',
    homeLead: 'Two courses that follow the meter’s real screens step by step. Each segment starts with a demonstration video, then small steps on the real meter or the simulator: recognised screens tick themselves, and actions the meter cannot see are confirmed by you and checked by a nurse.',
    recFirst: 'Start here', needQC: 'QC must pass before patient tests', fSteps: 'steps', fMicro: 'small steps', fVideos: 'video segments', fMin: 'minutes (approx.)',
    covAuto: n => `${n} steps recognise the screen`, covManual: n => `${n} steps confirmed by people`, startLearn: 'Start learning', startExam: 'Assessment', cont: n => `Continue · step ${pad(n)}`, contDone: 'View review',
    restartLearn: 'Restart (learning)', fullVideo: '▶ Full demonstration', progTxt: (a, b) => `${a} of ${b} steps done`,
    howTitle: 'How it works', how: [['Watch', 'Each segment opens with its demonstration video.'], ['Just use the meter', 'Operate the meter; when its screen moves on, recognition completes the step and the next one opens by itself.'], ['Tap only when needed', 'What the meter cannot see (checking labels, mixing, hand hygiene…) is one checklist per step: tap “Done” once, or “To confirm” if it cannot be confirmed on the spot.'], ['Review', 'Each course ends with a review: time, errors, retests and items a nurse still has to check. Copy it as a report.']],
    modesTitle: 'Two modes', modeLearn: 'Learning', modeExam: 'Assessment', modeLearnT: 'Learning mode', modeExamT: 'Assessment mode',
    modeLearnD: 'Videos, full explanations, tips and screen pictures all open. For the first time through.', modeExamD: 'No videos; small steps show their titles only. Tap “Hint” to see the explanation — hints are counted in the review.',
    rulesTitle: 'Ground rules', rules: ['MR guides the steps and gives training feedback; the meter measures and shows the real state. AH / hospital procedure and the actual configuration decide what to do.', 'Physical actions the meter cannot detect are never passed just because the screen moved on; anything that cannot be confirmed is marked “to confirm” for a nurse to check.', 'Example values, dates and lots on screen are not clinical rules; no extra thresholds, mixing counts or errors the meter does not guarantee are added.'],
    introEyebrow: (n, m) => `Segment ${n} of ${m}`, learnTitle: 'In this segment you learn', watchTitle: 'Watch for', warnTitle: 'Take care', stepsTitle: 'Steps in this segment',
    startModule: n => `Start step ${pad(n)} →`, backToStepN: n => `Back to step ${pad(n)} →`, vidPending: 'Video to be uploaded (placeholder)', vidWatched: 'watched', vidSegs: n => `${n} video${n > 1 ? 's' : ''}`, microN: n => `${n} small steps`,
    watchBtn: '▶ Segment video', moduleN: n => `Segment ${n}`, msTitle: (a, b) => `Small steps ${a} / ${b}`,
    kinds: { prep: 'prepare', do: 'do', scan: 'scan', look: 'look', wait: 'wait', check: 'check', choose: 'decide', safe: 'safety' },
    doneBtn: 'Done', undo: 'Undo', ckOk: 'Done', ckPend: 'To confirm', ckNote: 'If you cannot confirm it now, tap “To confirm” — a nurse checks it in the review.',
    seeBtn: 'I see it', seeNote: 'There is no training data for this screen: tap “I see it” when it shows. The simulator confirms it for you.',
    stTap: 'Confirmed', stSim: 'Shown on the simulator', stCls: 'Confirmed by recognition', stLater: 'Passed (a later screen was recognised)', stOk: 'Done', stPend: 'To confirm (nurse check)',
    visWait: 'Waiting', visDone: p => `Recognised ${p}%`, visKnown: 'Simulator: known screen (illustration, not recognised)', visShared: x => `Recognised with ${x}`, visOvr: 'Instructor pass',
    visTarget: x => `Screen shows “${x}”`, visSeq: (a, b) => `“${a}” first, then back to “${b}”`, visHalf: a => `✓ “${a}” recognised`, rescan: 'Reset recognition',
    skipNote: (x, a, b) => `Hourglass / measuring screens are not detected: seeing “${x}” completes ${a} and ${b}.`,
    levelTitle: 'Control level for this run', pass: 'PASS / in range', fail: 'FAIL / out of range',
    decRight: 'Correct.', decWrong: x => `Not right: the screen shows ${x}. Judge again.`, catRight: 'Correct.', catWrong: 'That does not match the result on screen. Recheck the value and flags, then choose again.', catLive: 'Live meter: an instructor reviews the judgement.',
    remainLeft: x => `Still to do: ${x}. After this step you return to QC 03 (new strip).`, remainNone: 'All required levels have passed. After this step: clean-up.',
    hint: 'Hint', hintUsed: 'Hint used', stepDone: 'Step complete', next: 'Next', prev: 'Back', toReview: 'Finish & review', nextLevel: 'Next level → QC 03', retest: 'Retest → QC 03 (new strip)',
    moreTitle: 'If this happens', record: 'This happened', kRetry: 'Correct / retry', kStop: 'Stop / escalate', kConfirm: 'To confirm', kOk: 'Normal / optional',
    refTitle: 'Step reference', refAction: 'Flowchart action', refPass: 'Pass criteria', refMr: 'MR line', refPage: 'Manual', refPageV: n => `Operator's Manual v8.0 · page ${n}`, refVision: 'Screen check', refScreens: 'Screens',
    refVisionNone: 'No screen recognition here: the screen does not change or has no training data, so people confirm it.',
    blockTitle: 'Stop / escalate: routine testing does not resume until solved', resolveGo: x => `Handled, back to ${x}`, resolveContinue: 'Record & continue', escalateEnd: 'Escalate & end training', approvedResume: 'Approved, resume per hospital procedure', support: 'Persistent error: contact support & end',
    goCourse: x => `Go to “${x}”`, backFromQC: x => `QC done → back to ${x}`, pendingReturn: x => `The patient course is waiting at ${x} (QC Lockout): go straight back once QC is done.`,
    now: 'Recognised', target: 'Target', targetSee: x => `Confirm by eye: ${x}`, noTarget: 'No screen check in this step', unreadable: 'Glare or blur — unreadable (frame skipped)', noScreen: 'No meter screen found',
    loading: 'Loading models…', clsReady: 'Classifier ready · loading detector…', ready: 'Models ready', modelErr: x => 'Model failed: ' + x, readability: 'readability', det: 'det',
    isStart: (x, y) => `“${x}” is where this step starts; once done, “${y}” should appear.`, notThisStep: x => `This is “${x}”, not this step’s target screen.`,
    tagSynth: 'Illustration', tagMan: 'Manual illustration', tagFail: 'Illustration: FAIL drawn over a real result screen', synthNote: 'Illustration: the model never saw this screen, so it is not recognised.', knownNote: x => `Illustration: the simulator treats it as the known screen “${x}”.`,
    fallbackNote: 'The recognition model cannot run here: the simulator uses the screen it knows it is showing; for photo or camera use “Instructor pass”.',
    note01: 'The patient flow has no control level page: this is probably Power Up or the “Use Strip Lot?” prompt. The model never saw those and mistakes them for level selection.',
    note00: 'Every red-cross error looks like Control Level Mismatch to the model (the only error alert in its training data). Go by the actual text on the meter.',
    simPower: 'Power on', simContinue: 'Continue ▶', simNotReady: 'Not ready', simFixed: 'Resolved ✓', simScanId: 'Scan own ID', simNoRead: 'No read in 10 s', simBadId: 'Invalid ID', simOk: 'OK ✓',
    simCT: 'Choose Control Test', simPT: 'Choose Patient Test', simPTwrong: 'Choose Patient Test by mistake', simBack: 'Back ←', simL1: 'Level 1 (Lo)', simL2: 'Level 2 (Hi)', simScanCtl: 'Scan matching control', simWrongCtl: 'Scan other-level control',
    simScanStrip: 'Scan strip vial', simInsert: 'Insert strip', simDefect: 'Strip Error', simRemove: 'Remove strip', simDose: 'Apply to strip front', simInterrupt: 'Interrupt measuring', simComment: 'Add comment 💬', simConfirmRes: 'Confirm result ✓', simOff: 'Switch off',
    simQCLock: 'QC Lockout', simDLLock: 'Download Lockout', simMenu: 'Extra test menu', simGlucose: 'Choose Glucose Test', simScanPt: 'Scan wristband', simPidBad: 'Invalid / not found', simIdOk: 'Details match ✓', simIdBad: 'Mismatch ✗',
    simLotOk: 'Lot matches ✓', simLotOther: 'Different lot ✗', simBlood: 'Blood to front edge', simDoseErr: 'Dosing error', simComments: 'Add comments 💬', simCmtDone: 'Comments chosen ✓', simOutcome: 'This measurement:', simWait: 'Meter working…',
    outcomes: { normal: 'Normal 6.0', high: 'High ↑ 12.2', crit: 'Critical CR LO', rr: 'RR HI', hilo: 'HI' },
    photoBtn: 'Choose or take a photo', photoHint: 'Take a photo of the meter (the whole meter is fine — the detector finds the screen).', camOn: 'Start camera', camOff: 'Stop camera',
    camHint: 'Point at the meter screen; the detector searches the whole frame, no need to line up a box.', camNone: 'This browser has no camera API', camDenied: 'Camera denied or unavailable (the shared link cannot use the camera; deploy on HTTPS).',
    simHint: 'The simulator shows real photographed screens (screens with training data) and Operator’s Manual drawings (screens without). Real screens run the classifier; drawings are not recognised and count as the known screen. Red buttons trigger flowchart branches.',
    arFail: 'Camera failed: ', arOverlay: 'Camera overlay mode', arXR: 'WebXR AR', arNoCamXR: 'WebXR here gives no camera frames; using overlay mode', aim: 'Bring the meter screen into view',
    mrStartQC: 'Gather the supplies, power on and scan your ID to log in.', mrStartPT: 'Gather the supplies and power on; check the meter status.',
    reviewTitle: 'Course review', reviewDone: 'Course complete', reviewEsc: 'Training stopped & escalated', reviewPend: 'Items still to confirm — complete once a nurse checks them',
    dur: 'Time', stepsDone: 'Steps done', levelsLbl: 'Control levels', catLbl: 'Result category', errors: 'Handling errors', retries: 'Retests / redos', ovrs: 'Instructor passes', pendLbl: 'To confirm', hintsLbl: 'Hints', modeLbl: 'Mode',
    colStep: 'Step', colVision: 'Screen check', colChecks: 'Confirmations', colBranches: 'Branches', nurseOk: 'Nurse confirms', timeline: 'Errors & retries', noEvents: 'No branch was triggered in this session.',
    copy: 'Copy report', copied: 'Copied', restart: 'Restart this course', backToStep: x => `Back to ${x}`, toHome: 'Course home', nextCourse: x => `Next: ${x} →`,
    vAuto: (x, p) => `auto · ${x} ${p}%`, vKnown: 'simulator (illustration)', vSee: 'by eye', vSeeSim: 'simulator', vSeeCls: 'recognised', vSeeTap: 'trainee', vOvr: 'instructor pass', vShared: x => `with ${x}`, vNone: 'not checked', vNo: 'not done',
    lvPass: 'PASS', lvFail: 'FAIL', evHint: 'hint viewed', evWrongCat: x => `wrong category (chose “${x}”)`,
  },
};
const S = { lang: LS.get('qc.lang2', 'en'), src: 'sim', view: 'home', course: null };   // English by default (new key, so earlier saved choices don't override it)
const t = (k, ...a) => { const v = TXT[S.lang][k]; return typeof v === 'function' ? v(...a) : (v == null ? k : v); };
const L = o => o ? (o[S.lang] || o.zh) : '';

/* ---------------- screens: real photos (13 classes) · manual drawings · synthetic illustrations ---------------- */
const SCR = {
  '00_control_level_mismatch': { src: 'real', zh: 'Control Level Mismatch 弹窗', en: 'Control Level Mismatch alert' },
  '01_qc_level_selection': { src: 'real', zh: '质控等级选择', en: 'Control level selection' },
  '02a_control_insert_strip': { src: 'real', zh: '绿色插入箭头', en: 'Green insert arrow' },
  '02b_control_apply_drop': { src: 'real', zh: '闪烁液滴', en: 'Flashing drop' },
  '03_control_test_feedback': { src: 'real', zh: 'Add Comments 备注', en: 'Add Comments' },
  '04_control_test_result': { src: 'real', zh: '质控结果', en: 'Control result' },
  '05_main_menu': { src: 'real', zh: 'Main Menu 主菜单', en: 'Main Menu' },
  '06_operator_id': { src: 'real', zh: 'Operator ID 登录', en: 'Operator ID' },
  '07_patient_id': { src: 'real', zh: 'Patient ID 患者 ID', en: 'Patient ID' },
  '08_patient_test_insert_strip': { src: 'real', zh: '插入试纸提示', en: 'Insert-strip prompt' },
  '11_patient_test_result': { src: 'real', zh: '患者结果', en: 'Patient result' },
  '12a_use_control_lot': { src: 'real', zh: 'Use Control Lot 质控液批次', en: 'Use Control Lot' },
  '12b_strip_lots': { src: 'real', zh: 'Use Strip Lot 试纸批次', en: 'Use Strip Lot' },
  result_fail: { src: 'mod', infer: true, as: '04_control_test_result', zh: '质控结果 Out of Range', en: 'Control result: Out of Range' },
  powerup: { src: 'man', img: 'image1', zh: 'Power Up 开机画面', en: 'Power Up' },
  p_confirm: { src: 'man', img: 'image5', zh: 'Patient Confirmation 患者确认', en: 'Patient Confirmation' },
  p_use_lot: { src: 'man', img: 'image6', zh: '「Use Strip Lot?」提示', en: '“Use Strip Lot?” prompt' },
  p_hourglass: { src: 'man', img: 'image8', zh: '沙漏（试纸检查）', en: 'Hourglass (strip check)' },
  p_drop: { src: 'man', img: 'image9', zh: '闪烁血滴图标', en: 'Flashing blood drop' },
  p_measuring: { src: 'man', img: 'image10', zh: '测量进度', en: 'Measuring' },
  p_res_high: { src: 'man', img: 'image12', as: '11_patient_test_result', zh: '结果 ↑ Out of Normal Range', en: 'Result ↑ Out of Normal Range' },
  p_res_crit: { src: 'man', img: 'image13', as: '11_patient_test_result', zh: '结果 CR LO（危急）', en: 'Result CR LO (critical)' },
  p_res_rr: { src: 'mod', base: 'image13', as: '11_patient_test_result', zh: '结果 RR HI（超出报告范围）', en: 'Result RR HI (outside reportable)' },
  p_res_hilo: { src: 'mod', base: 'image13', as: '11_patient_test_result', zh: '结果 HI（超出测量范围）', en: 'Result HI (outside measuring range)' },
  p_comments: { src: 'man', img: 'image14', zh: 'Add Comments 评论', en: 'Add Comments' },
  p_res_cmt: { src: 'man', img: 'image15', as: '11_patient_test_result', zh: '结果（含评论）', en: 'Result with comments' },
  off: { src: 'syn', zh: '关机', en: 'Off' },
  hourglass_check: { src: 'syn', zh: '试纸检查沙漏', en: 'Strip-check hourglass' },
  hourglass_measure: { src: 'syn', zh: '测量沙漏', en: 'Measuring hourglass' },
  strip_error: { src: 'syn', zh: 'Strip Defect Error', en: 'Strip Defect Error' },
  id_invalid: { src: 'syn', zh: 'ID 无效', en: 'Invalid ID' },
  meas_error: { src: 'syn', zh: '测量中断／设备错误', en: 'Interrupted / meter error' },
  p_status_err: { src: 'syn', zh: '设备状态异常', en: 'Meter not ready' },
  qc_lockout: { src: 'syn', zh: 'QC Lockout', en: 'QC Lockout' },
  dl_lockout: { src: 'syn', zh: 'Download Lockout', en: 'Download Lockout' },
  test_menu: { src: 'syn', zh: '测试项目菜单', en: 'Test selection menu' },
  pid_invalid: { src: 'syn', zh: '患者 ID 无效／未找到', en: 'Patient ID invalid / not found' },
  dose_error: { src: 'syn', zh: '加样错误', en: 'Dosing error' },
};
const scrName = k => (SCR[k] ? L(SCR[k]) : k);

/* ---------------- settings & state ---------------- */
const CFG = { th: LS.get('qc.th', 0.7), hold: LS.get('qc.hold', 3), auto: LS.get('qc.auto', true), confirm: LS.get('qc.confirm', true), probs: LS.get('qc.probs', false), req: LS.get('qc.req', ['L1', 'L2']) };
const RUNS = {};
let C = null, BY = {}, STEPS = [], R = null;
function newRun(cid, mode) {
  return { course: cid, mode, i: 1, iter: 1, level: null, decision: null, simTruth: null, cat: null, catTruth: null, block: null, ended: null, mr: null,
    levels: Object.fromEntries(LEVELS.map(l => [l, { attempts: [] }])), rec: {}, log: [], startedAt: Date.now(), finishedAt: null, nurse: {},
    introSeen: {}, mod: null, hints: {}, watched: {}, open: null };
}
function useCourse(cid) { C = COURSES[cid]; BY = {}; STEPS = C.steps; STEPS.forEach(s => BY[s.no] = s); S.course = cid; R = RUNS[cid] || null; }
const isQC = () => !!C && C.id === 'qc';
const N = () => STEPS.length;
const ref = (no, c = C) => `${L(c).ref} ${pad(no)}`;
function rec(no) {
  if (!R.rec[no]) R.rec[no] = { vision: null, checks: {}, micro: {}, seq: 0, hits: {}, visits: 0 };
  return R.rec[no];
}
function logEv(kind, no, extra) { R.log.push(Object.assign({ at: Date.now() - R.startedAt, kind, no, lv: R.level, iter: R.iter }, extra)); }
function moduleOf(no) { return C.modules.find(m => no >= m.steps[0] && no <= m.steps[1]); }

/* ---------------- vision spec & evaluation ---------------- */
const V = { streak: 0, cls: null, last: null, at: 0, reset() { this.streak = 0; this.cls = null; this.last = null; } };
/* what the current step looks for, given the run state */
function spec(no) {
  const s = BY[no], v = s && s.vision; if (!v) return null;
  if (isQC() && no === 12) return { targets: v.passTargets, errors: {} };                    // after ✓ the meter shows the level page or Main Menu
  if (isQC() && no === 13) return { targets: v.loopTargets.concat(v.targets), errors: {} };   // level page or Main Menu (another level = another round)
  return { targets: v.targets, start: v.start || [], errors: v.errors || {}, shared: v.sharedWith };
}
function visionDone(no) { const r = rec(no); return !BY[no].vision || !!(r.vision && r.vision.done); }
function targetsOf(no) { const sp = spec(no); if (!sp) return []; return sp.sequence ? [sp.sequence[Math.min(rec(no).seq, sp.sequence.length - 1)]] : sp.targets; }
function argmax(p) { let b = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i; return b; }
/* the result page shows changing numbers, so the model is less sure there: ≥ 60 % counts (11-09, user request); other pages use the setting */
function thAt(no, c) { const v = BY[no] && BY[no].vision; return v && v.resultPage && (v.targets || []).includes(c) ? Math.min(CFG.th, .6) : CFG.th; }
/* res: {probs, read, box, det, src, single, known} */
function evaluate(res) {
  V.last = res; V.at = performance.now();
  if (S.view !== 'step' || !R || R.block) return;
  const no = R.i, sp = spec(no);
  if (!res.probs) { V.streak = 0; return; }
  if (res.read < READ_MIN) { res.unreadable = true; return; }          // unreadable: neither counts nor resets
  const b = argmax(res.probs), p = res.probs[b], c = CLASSES[b];
  res.cls = c; res.p = p;
  if (followMeter(c, p)) return;
  if (p < thAt(no, c)) { V.streak = 0; V.cls = null; return; }
  V.streak = V.cls === c ? V.streak + 1 : 1; V.cls = c;
  if (V.streak < (res.single ? 1 : CFG.hold)) return;
  // "see" small steps that a recognisable screen can also satisfy
  let changed = false;
  for (const m of microsOf(no)) if (m.done === 'see' && m.cls && m.cls.includes(c) && !rec(no).micro[m.id]) { rec(no).micro[m.id] = 'cls'; changed = true; }
  const after = () => { if (changed) { maybeAuto('vision'); render(); } };
  if (!sp) return after();
  const err = sp.errors && sp.errors[c], key = 'auto:' + err + ':' + R.iter + ':' + rec(no).visits;
  if (err && !rec(no).hits[key]) { rec(no).hits[key] = 1; V.streak = 0; triggerBranch(err, { auto: true, cls: c, p }); return; }
  if (visionDone(no)) return after();
  if (!sp.sequence && !sp.targets.includes(c) && V.streak >= CFG.hold * 3 && p >= Math.max(CFG.th, 0.9) && (curMicro(no) || {}).done === 'vision' && aheadOf(no, c)) return passVision(no, c, p, 'ahead');
  if (sp.sequence) {
    const r = rec(no);
    if (c === sp.sequence[r.seq]) { r.seq++; V.streak = 0; if (r.seq >= sp.sequence.length) return passVision(no, c, p, res.known ? 'known' : 'auto'); changed = true; }
    return after();
  }
  if (sp.targets.includes(c)) return passVision(no, c, p, res.known ? 'known' : 'auto');
  after();
}
/* ---------------- hidden: follow the meter inside a segment (team request 11-08) ----------------
 * Recognition runs in every step of a segment (xr.js keeps sending frames; nothing extra is shown). When the meter shows, clearly
 * and steadily, the screen of a LATER step of the same segment, the flow jumps there — the trainee is ahead of the tutorial.
 * - The segment videos are the borders: a screen that belongs to another segment never moves the flow.
 * - Forward only: screens the model never learned (hourglass, blood drop) are taken for earlier pages, so a jump back would misfire.
 * - After any other step change (Back, instructor pass, a normal pass), the screen the meter showed at that moment is ignored
 *   until it changes, so the flow never fights the trainee or the instructor.
 * Skipped steps: their screen checks count as seen ('jump'), checklists not ticked go to the nurse ('pending'), taps count as done. */
const FOLLOW = { on: LS.get('qc.follow', true), p: .9, hold: 6, grace: 2500 };
const JUMP = { cls: null, n: 0 };
const finalScreens = n => { const v = BY[n] && BY[n].vision; return v ? [].concat(v.passTargets || v.targets || [], v.loopTargets || []) : []; };   // the meter after this step
const onScreens = n => { const v = BY[n] && BY[n].vision; return v && v.start && v.start.length ? v.start : n > 1 ? finalScreens(n - 1) : []; };   // the meter while doing it
function expected(no) { const v = BY[no] && BY[no].vision; return new Set([].concat(onScreens(no), finalScreens(no), v && v.sequence || [], v && v.targets || [], v && v.via || [])); }   // via: pages passed on the way (QC 04: Use Strip Lot)
/* the later step of this segment that screen c belongs to: the step done on that screen, else the step that ends on it (pass: its check counts too) */
function aheadStep(c) {
  const mod = moduleOf(R.i); if (!mod) return null;
  for (let n = R.i + 1; n <= mod.steps[1]; n++) if (onScreens(n).includes(c)) return { to: n, pass: false };
  for (let n = R.i + 1; n <= mod.steps[1]; n++) if (finalScreens(n).includes(c)) return { to: n, pass: true };
  return null;
}
function followMeter(c, p) {
  if (!FOLLOW.on) return false;
  if (!c || p < FOLLOW.p) { JUMP.n = 0; JUMP.cls = null; return false; }
  JUMP.n = JUMP.cls === c ? JUMP.n + 1 : 1; JUMP.cls = c;
  const no = R.i, sp = spec(no);
  if (R.holdCls) { if (c === R.holdCls) return false; if (JUMP.n >= FOLLOW.hold) R.holdCls = null; }   // the meter moved on: following resumes
  if (expected(no).has(c) || (sp && sp.errors && sp.errors[c])) return false;
  if (JUMP.n < FOLLOW.hold || performance.now() - (R.enteredAt || 0) < FOLLOW.grace) return false;
  const a = aheadStep(c); if (!a) return false;
  const from = no; for (let n = from; n < a.to; n++) fillStep(n, c, p); if (a.pass) fillStep(a.to, c, p);
  logEv('jump', from, { to: a.to, cls: c, p });
  JUMP.n = 0; go(a.to, { noIntro: true, auto: true, follow: true });
  return true;
}
function fillStep(n, c, p) {
  const r = rec(n), v = BY[n].vision, stamp = { done: true, how: 'jump', cls: c, p, at: Date.now() };
  if (v && !(r.vision && r.vision.done)) { r.vision = stamp; (v.alsoCompletes || []).forEach(k => { const rr = rec(k); if (!rr.vision || !rr.vision.done) rr.vision = Object.assign({}, stamp, { how: 'shared', from: n }); }); }
  for (const m of microsOf(n)) {
    if (m.done === 'check' && !r.checks[m.ck]) r.checks[m.ck] = 'pending';
    else if ((m.done === 'tap' || m.done === 'see') && !r.micro[m.id]) r.micro[m.id] = 'jump';
  }
}
/* is screen class c the target of the next step (and not a screen of this or the last few steps)? — the meter is ahead of the flow */
function aheadOf(no, c) {
  const scr = n => { const v = BY[n] && BY[n].vision; return v ? [].concat(v.targets || [], v.passTargets || [], v.loopTargets || [], v.sequence || [], v.start || []) : []; };
  for (let n = Math.max(1, no - 3); n <= no; n++) if (scr(n).includes(c)) return false;
  for (let n = no + 1; n <= Math.min(N(), no + 1); n++) { const v = BY[n].vision; if (v && [].concat(v.targets || [], v.passTargets || [], v.loopTargets || []).includes(c)) return true; }
  return false;
}
function passVision(no, c, p, how = 'auto') {
  const r = rec(no); r.vision = { done: true, how, cls: c, p, at: Date.now() };
  logEv(how === 'override' ? 'override' : 'vision', no, { cls: c, p, how });
  const v = BY[no].vision;
  (v && v.alsoCompletes || []).forEach(n => { const rr = rec(n); if (!rr.vision || !rr.vision.done) rr.vision = { done: true, how: 'shared', from: no, cls: c, p, at: Date.now() }; });
  V.streak = 0; beep(); maybeAuto(how === 'override' ? 'tap' : 'vision'); render();
}
function override() { if (S.view === 'step' && BY[R.i].vision && !visionDone(R.i)) passVision(R.i, null, null, 'override'); }
function resetVision() {
  const r = rec(R.i); r.vision = null; r.seq = 0; V.reset();
  const v = BY[R.i].vision; (v && v.alsoCompletes || []).forEach(n => { const rr = rec(n); if (rr.vision && rr.vision.how === 'shared') rr.vision = null; });
  render();
}

/* ---------------- small steps (micro) ---------------- */
function microsOf(no) {
  const s = BY[no]; if (!s) return [];
  return (s.micro || []).filter(m => !(m.onlyFail && R.decision !== 'fail') && !(m.onlyPass && R.decision === 'fail'));
}
function decisionState() { return !R.cat ? '' : R.catTruth && R.cat !== R.catTruth ? 'wrong' : 'ok'; }   // patient result category (QC has no judgement buttons)
function microState(no, m) {
  const r = rec(no);
  switch (m.done) {
    case 'tap': return r.micro[m.id] ? 'ok' : '';
    case 'see': { if (r.micro[m.id]) return 'ok'; const ms = microsOf(no), i = ms.indexOf(m); return ms.slice(i + 1).some(x => x.done === 'vision') && BY[no].vision && visionDone(no) ? 'ok' : ''; }
    case 'check': return r.checks[m.ck] === 'ok' ? 'ok' : r.checks[m.ck] === 'pending' ? 'pend' : '';
    case 'vision': return visionDone(no) ? (r.vision && r.vision.how === 'override' ? 'ovr' : 'ok') : '';
    case 'decision': return decisionState();
  }
  return '';
}
const DONE = new Set(['ok', 'pend', 'ovr']);
const microDone = (no, m) => DONE.has(microState(no, m));
function curMicro(no) { return microsOf(no).find(m => !microDone(no, m)) || null; }
function complete(no) { if (no == null) no = R.i; if (BY[no] && BY[no].folded) return complete(no - 1); const ms = microsOf(no); return ms.length > 0 && ms.every(m => microDone(no, m)); }
function microTap(id) { const r = rec(R.i); r.micro[id] = 'ok'; R.open = null; render(); maybeAuto(); }
function microUndo(id) { const r = rec(R.i), m = (BY[R.i].micro || []).find(x => x.id === id); if (!m) return; if (m.done === 'check') delete r.checks[m.ck]; else delete r.micro[id]; R.open = id; render(); }
function setCheck(id, val) { const r = rec(R.i); r.checks[id] = r.checks[id] === val ? '' : val; R.open = null; render(); maybeAuto(); }
function useHint(id) { const k = R.i + ':' + id; if (!R.hints[k]) { R.hints[k] = Date.now(); logEv('hint', R.i, { id }); } render(); }

/* ---------------- navigation ---------------- */
function go(no, opts = {}) {
  if (!R || no < 1 || no > N()) return;
  if (BY[no].folded) { const n2 = R && no < R.i ? no - 1 : no + 1; if (n2 >= 1 && n2 <= N()) return go(n2, opts); }   // a step folded into the one before it (QC 07, 13) is never shown
  R.i = no; rec(no).visits++; V.reset(); R.open = null; R.awaitConfirm = null; stopAuto();
  R.enteredAt = performance.now(); if (!opts.follow) R.holdCls = JUMP.cls;   // see followMeter: ignore the screen the meter shows right now
  if (!opts.keepMr) R.mr = null;
  const mod = moduleOf(no);
  if (R.mode === 'learn' && !opts.noIntro && mod && mod.steps[0] === no && !R.introSeen[mod.id]) { S.view = 'intro'; R.mod = mod.id; }
  else S.view = 'step';
  render();
  if (opts.auto) maybeAuto();   // e.g. QC 07 / 10, already completed by the step before
}
function startModule() {
  const mod = C.modules.find(m => m.id === R.mod); if (!mod) return;
  R.introSeen[mod.id] = true;
  if (R.i >= mod.steps[0] && R.i <= mod.steps[1]) { S.view = 'step'; render(); maybeAuto(); }
  else go(mod.steps[0], { noIntro: true, auto: true });
}
/* re-do a stretch of steps (new strip / new level): records for from..to are cleared */
function redo(from, to) {
  for (let n = from; n <= to; n++) { const r = rec(n); r.vision = null; r.seq = 0; r.checks = {}; r.micro = {}; }
  if (isQC() && from <= 11 && to >= 11) { R.decision = null; R.simTruth = null; }
  if (!isQC() && from <= 13 && to >= 13) R.cat = null;
  if (!isQC() && from <= 11 && to >= 11) R.catTruth = null;
}
/* a completed step moves on by itself after a tap / choice (1.5 s); after a recognised screen it waits up to 7 s for the trainee to confirm, then goes on */
function stopAuto() { clearTimeout(maybeAuto.t); maybeAuto.live = false; }
/* the pending auto-advance, for the countdown on the Next button: {at, ms} or null */
function autoInfo() { return maybeAuto.live && R && S.view === 'step' && maybeAuto.no === R.i ? { at: maybeAuto.at, ms: maybeAuto.ms } : null; }
function maybeAuto(src) {
  stopAuto();
  if (!R || S.view !== 'step' || R.block || !complete()) return;
  const wait = src === 'vision' && CFG.confirm;   // a recognised screen waits for the tap, and confirms by itself after 7 s (button counts down)
  if (wait) R.awaitConfirm = R.i;
  if (!CFG.auto) return;
  const at = R.i, s = BY[at], ms = wait ? CONFIRM_MS : s.decision ? 2200 : 1500;
  Object.assign(maybeAuto, { live: true, no: at, at: performance.now(), ms });
  maybeAuto.t = setTimeout(() => { maybeAuto.live = false; if (R.i === at && S.view === 'step' && complete() && !R.block) next(); }, ms);
}
const CONFIRM_MS = 7000, VIDEO_MS = 7000;   // countdowns: after a recognised screen, after the segment video (team request 11-06)
/* a round is over: back to the start page, which shows this round's summary */
let LAST = null;
const ROUNDS = { qc: 0, patient: 0 };
function finish() {
  stopAuto();
  if (!R.finishedAt) { R.finishedAt = Date.now(); ROUNDS[R.course] = (ROUNDS[R.course] || 0) + 1; }
  LAST = R; S.view = 'home'; render();
}
function completeIn(run, c, no) {
  const s0 = c.steps.find(x => x.no === no); if (s0 && s0.folded) return completeIn(run, c, no - 1);
  const s = s0, r = run.rec[no]; if (!s || !r) return false;
  return (s.micro || []).every(m => m.done === 'vision' ? !s.vision || !!(r.vision && r.vision.done) : m.done === 'check' ? ['ok', 'pending'].includes(r.checks[m.ck])
    : m.done === 'decision' ? !!run.cat : m.done === 'see' || m.done === 'tap' ? !!r.micro[m.id] || !!(r.vision && r.vision.done) : true);
}
/* summary of a finished round for the start page */
function roundSummary(run) {
  if (!run) return null;
  const c = COURSES[run.course], pend = [];
  for (const s of c.steps) { const r = run.rec[s.no]; if (r) for (const k of s.checks || []) if (r.checks[k.id] === 'pending') pend.push({ no: s.no, id: k.id, ref: ref(s.no, c), label: L(k), step: L(s).title }); }
  return { course: run.course, title: L(c).title, round: ROUNDS[run.course] || 1, dur: (run.finishedAt || Date.now()) - run.startedAt, done: stepsDone(run), total: c.steps.length,
    ended: run.ended, overrides: run.log.filter(e => e.kind === 'override').length, jumps: run.log.filter(e => e.kind === 'jump').length, events: run.log.filter(e => e.kind === 'branch' && !e.flow).length,
    failed: run.log.some(e => e.kind === 'branch' && e.id === 'fail'), cat: run.cat ? L(c.cats.find(x => x.id === run.cat)).t : null, pending: pend };
}
function nurseConfirmLast(key) {
  const run = LAST; if (!run) return; const [no, id] = key.split(':'), r = run.rec[+no];
  if (r && r.checks[id] === 'pending') { r.checks[id] = 'ok'; run.nurse[key] = Date.now(); run.log.push({ at: Date.now() - run.startedAt, kind: 'nurse', no: +no, id }); }
  render();
}
function next() {
  if (!complete() || R.block) return;
  const no = R.i;
  if (!isQC() && no === 13) logEv('decision', 13, { val: R.cat, truth: R.catTruth });   // QC: one level per round, no in-app loop
  if (no === N()) return finish();
  go(no + 1, { auto: true });   // folded steps are skipped inside go()
}
function branch(no, id) { return (BY[no].branches || []).find(b => b.id === id); }

/* ---------------- branches ---------------- */
function triggerBranch(id, info = {}) {
  const no = R.i, b = branch(no, id); if (!b) return;
  const r = rec(no); r.hits[id] = (r.hits[id] || 0) + 1;
  logEv('branch', no, { id, type: b.type, auto: !!info.auto, alt: !!info.alt, cls: info.cls || null });
  setMr(L(b).mr, b.type);
  if (b.pend) {   // "待确认" branches: mark the related checks for a nurse
    (BY[no].checks || []).filter(c => !(c.onlyFail && R.decision !== 'fail')).forEach(c => { if (b.pend === 'all' ? r.checks[c.id] !== 'ok' : c.id === b.pend) r.checks[c.id] = 'pending'; });
  }
  stopAuto();
  if (b.type === 'stop') { R.block = { no, id }; render(); return; }
  if (b.info) { render(); return; }
  if (isQC() && id === 'fail') { go(12, { keepMr: true }); return; }
  const target = info.alt && b.alt ? b.alt.go : b.go;
  if (target == null) { render(); return; }
  if (target < no) { redo(target, Math.min(no, N() - 1)); if (b.newStrip) R.iter++; go(target, { keepMr: true, noIntro: true }); return; }
  if (target === no) { r.vision = null; r.seq = 0; V.reset(); render(); return; }
  go(target, { keepMr: true, noIntro: true });
}
function resolveBlock(how) {
  const bl = R.block; if (!bl) return;
  const b = branch(bl.no, bl.id);
  if (how === 'course') { logEv('resolve', bl.no, { id: bl.id, how }); switchCourse(b.course); return; }
  R.block = null; logEv('resolve', bl.no, { id: bl.id, how });
  if (how === 'end') { R.ended = 'escalated'; finish(); return; }
  if (b.go == null) { render(); return; }
  if (b.go < bl.no) { redo(b.go, Math.min(bl.no, N() - 1)); R.iter++; }
  else { const r = rec(b.go); r.vision = null; r.seq = 0; }
  go(b.go, { keepMr: true, noIntro: true });
}

/* ---------------- MR band ---------------- */
function setMr(txt, tone) { R.mr = { txt, tone, no: R.i }; }
function catOf(id) { return (C.cats || []).find(c => c.id === id); }
function stepMr(no) { if (!isQC() && no === 13 && R.cat) return L(catOf(R.cat)).act; return L(BY[no]).mr; }
function mrNow() {
  if (R.mr && R.mr.txt) return R.mr;
  const no = R.i;
  if (complete(no) || (BY[no].vision && visionDone(no) && !BY[no].decision)) return { txt: stepMr(no), tone: 'ok' };
  if (no === 1) return { txt: t(isQC() ? 'mrStartQC' : 'mrStartPT'), tone: 'info' };
  return { txt: stepMr(no - 1), tone: 'info' };
}

/* ---------------- course switching ---------------- */
function startCourse(cid, mode, fresh) {
  stopAuto();
  useCourse(cid);
  if (!R || fresh) { const prev = R, seen = prev ? prev.introSeen : SEEN[cid]; R = RUNS[cid] = newRun(cid, mode || 'learn'); if (seen) R.introSeen = Object.assign({}, seen); }
  V.reset();
  if (R.finishedAt && !fresh) { finish(); return; }
  go(R.i);
}
/* drop an unfinished round (exited midway, wants to start over): the course then offers a new round from step 1. Segment videos already watched stay watched. */
const SEEN = {};
function resetCourse(cid) {
  const run = RUNS[cid]; if (!run || run.finishedAt) return false;
  SEEN[cid] = Object.assign({}, run.introSeen); delete RUNS[cid];
  if (S.course === cid) { stopAuto(); R = null; V.reset(); S.view = 'home'; }
  render(); return true;
}
function switchCourse(cid) { startCourse(cid, 'learn', !RUNS[cid] || !!RUNS[cid].finishedAt); }   // an unfinished run (e.g. patient waiting on QC) continues
function goHome() { S.view = 'home'; stopAuto(); render(); }

/* ---------------- inference worker ---------------- */
const INF = { w: null, cls: false, det: false, err: null, busy: false, seq: 0, cb: {}, lastSend: 0 };
function initWorker() {
  const base = new URL('./', document.baseURI).href;
  const start = w => {
    INF.w = w;
    INF.w.onmessage = e => {
      const m = e.data;
      if (m.type === 'cls-ready') { INF.cls = true; renderModel(); }
      else if (m.type === 'det-ready') { INF.det = true; renderModel(); }
      else if (m.type === 'error') { INF.err = m.msg; renderModel(); }
      else if (m.type === 'res') { INF.busy = false; const cb = INF.cb[m.id]; delete INF.cb[m.id]; if (cb) cb(m); }
    };
    INF.w.onerror = e => { INF.err = (e && e.message) || 'worker'; renderModel(); };
    INF.w.postMessage({ type: 'init', base, models: window.QC_MODELS || 'js' });
  };
  // a file worker first; some sandboxes only allow blob: workers, so fall back to one built from the same script
  try { start(new Worker(base + 'infer-worker.js')); }
  catch (e) {
    fetch(base + 'infer-worker.js').then(r => r.text()).then(src => start(new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))))
      .catch(er => { INF.err = String((er && er.message) || er); renderModel(); });
  }
  // if nothing is ready after 30 s, the simulator falls back to the known screen so the flow stays usable
  setTimeout(() => { if (!INF.cls && !INF.err) { INF.err = 'timeout'; renderModel(); } }, 30000);
}
const capC = document.createElement('canvas'), capX = capC.getContext('2d', { willReadFrequently: true });
/* src: video | img | canvas | {data,width,height}; mode 'full' | 'screen' */
function infer(src, mode, maxW = 1280, flip = false) {
  if (!INF.w || INF.busy || !(mode === 'screen' ? INF.cls : INF.det)) return null;
  let w, h;
  if (src && src.data && src.width && !(src instanceof HTMLCanvasElement)) { w = src.width; h = src.height; }
  else if (src instanceof HTMLVideoElement) { w = src.videoWidth; h = src.videoHeight; }
  else { w = src.naturalWidth || src.width; h = src.naturalHeight || src.height; }
  if (!w || !h) return null;
  const k = Math.min(1, maxW / Math.max(w, h)), W = Math.round(w * k), H = Math.round(h * k);
  if (src.data && !(src instanceof HTMLCanvasElement)) {
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    tmp.getContext('2d').putImageData(new ImageData(src.data instanceof Uint8ClampedArray ? src.data : new Uint8ClampedArray(src.data), w, h), 0, 0);
    capC.width = W; capC.height = H;
    if (flip) { capX.save(); capX.translate(0, H); capX.scale(1, -1); capX.drawImage(tmp, 0, 0, W, H); capX.restore(); } else capX.drawImage(tmp, 0, 0, W, H);
  } else { capC.width = W; capC.height = H; capX.drawImage(src, 0, 0, W, H); }
  const d = capX.getImageData(0, 0, W, H);
  const id = ++INF.seq; INF.busy = true; INF.lastSend = performance.now();
  return new Promise(res => {
    INF.cb[id] = m => { if (m.box) m.box = { x: m.box.x / W, y: m.box.y / H, w: m.box.w / W, h: m.box.h / H, s: m.box.s }; m.fw = W; m.fh = H; res(m); };
    INF.w.postMessage({ type: 'frame', id, w: W, h: H, data: d.data.buffer, mode }, [d.data.buffer]);
  });
}

/* ---------------- screen drawing (simulator + thumbnails) ---------------- */
const IMG = {}; for (const k in (window.SIM_SCREENS || {})) { const im = new Image(); im.src = window.SIM_SCREENS[k]; IMG[k] = im; }
const MIMG = {}; for (const k in (window.MANUAL_SCREENS || {})) { const im = new Image(); im.src = window.MANUAL_SCREENS[k]; MIMG[k] = im; }
const scrC = document.createElement('canvas'); scrC.width = 300; scrC.height = 400; const scrX = scrC.getContext('2d', { willReadFrequently: true });
function rrect(x, X, Y, W, H, R0) { x.beginPath(); x.moveTo(X + R0, Y); x.arcTo(X + W, Y, X + W, Y + H, R0); x.arcTo(X + W, Y + H, X, Y + H, R0); x.arcTo(X, Y + H, X, Y, R0); x.arcTo(X, Y, X + W, Y, R0); x.closePath(); }
const SYN_ERR = {
  strip_error: { msg: ['Strip Defect Error', 'Remove the strip and', 'insert a new one.'] },
  meas_error: { msg: ['Error', 'Test interrupted.', 'Repeat the test.'] },
  dose_error: { msg: ['Error', 'Sample problem.', 'Repeat with a new strip.'] },
  id_invalid: { title: 'Operator ID', plain: true, msg: ['Invalid ID', 'Operator ID not', 'recognised.'] },
  pid_invalid: { title: 'Patient ID', plain: true, msg: ['Invalid ID', 'Patient ID not', 'found.'] },
  p_status_err: { title: 'Power Up', plain: true, msg: ['Battery low', 'Charge the meter', 'before testing.'] },
  qc_lockout: { title: 'Main Menu', plain: true, msg: ['QC Lockout', 'Control test required', 'before patient testing.'] },
  dl_lockout: { title: 'Main Menu', plain: true, msg: ['Download Lockout', 'Dock the meter to', 'transfer data.'] },
};
/* device-style illustration for screens with no training data */
function drawSynth(x, key, course) {
  const W = 300, H = 400, qc = course === 'qc';
  if (key === 'off') { x.fillStyle = '#05080a'; x.fillRect(0, 0, W, H); return; }
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#eef3fb'); g.addColorStop(1, '#dfe8f6'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const E = SYN_ERR[key] || {};
  const title = E.title || (key === 'test_menu' ? 'Patient Test' : qc ? 'Control Test' : 'Patient Test');
  x.fillStyle = '#2f63b4'; x.fillRect(0, 0, W, 26); x.fillStyle = '#fff'; x.font = '600 14px Arial, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(title, 8, 13); x.fillText('12:48', W - 44, 13);
  x.fillStyle = '#3a4a5c'; x.font = '12px Arial, sans-serif';
  if (!E.plain && key !== 'test_menu') { if (qc) { x.fillText('Control L1 (Lo) 25701070', 10, 42); x.fillText('Strip Lot 672024', 10, 58); } else { x.fillText('Patient 123456789', 10, 42); x.fillText('Strip Lot 545794', 10, 58); } }
  x.fillStyle = '#c9d6ea'; x.fillRect(0, H - 22, W, 22); x.fillStyle = '#3a4a5c'; x.font = '11px Arial, sans-serif'; x.fillText('03/17/21', 8, H - 11);
  if (key === 'hourglass_check' || key === 'hourglass_measure') {
    const cx = W / 2, cy = 205; x.strokeStyle = '#3a4a5c'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(cx - 34, cy - 54); x.lineTo(cx + 34, cy - 54); x.lineTo(cx + 4, cy); x.lineTo(cx + 34, cy + 54); x.lineTo(cx - 34, cy + 54); x.lineTo(cx - 4, cy); x.closePath(); x.stroke();
    x.fillStyle = '#c99a2e'; x.beginPath(); x.moveTo(cx - 20, cy - 40); x.lineTo(cx + 20, cy - 40); x.lineTo(cx, cy - 6); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(cx - 26, cy + 50); x.lineTo(cx + 26, cy + 50); x.lineTo(cx, cy + 26); x.closePath(); x.fill();
    if (key === 'hourglass_measure') { x.fillStyle = '#3a4a5c'; x.font = '13px Arial, sans-serif'; x.textAlign = 'center'; x.fillText('Measuring…', cx, cy + 86); x.textAlign = 'left'; }
    return;
  }
  if (key === 'test_menu') {
    ['Glucose Test', 'Other test'].forEach((s, i) => { x.strokeStyle = '#2f63b4'; x.lineWidth = 2; rrect(x, 30, 80 + i * 56, 240, 40, 12); x.stroke(); x.fillStyle = '#1d2a38'; x.font = '15px Arial, sans-serif'; x.textAlign = 'center'; x.fillText(s, 150, 100 + i * 56); x.textAlign = 'left'; });
    return;
  }
  const msg = E.msg || ['Error', '', ''];
  x.fillStyle = '#d13a2f'; x.beginPath(); x.arc(40, 120, 16, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3.5;
  x.beginPath(); x.moveTo(33, 113); x.lineTo(47, 127); x.moveTo(47, 113); x.lineTo(33, 127); x.stroke();
  x.fillStyle = '#1d2a38'; x.font = '600 16px Arial, sans-serif'; x.fillText(msg[0], 66, 120);
  x.font = '13px Arial, sans-serif'; x.fillStyle = '#3a4a5c'; x.fillText(msg[1], 66, 150); x.fillText(msg[2], 66, 168);
  x.strokeStyle = '#3a4a5c'; x.lineWidth = 2; rrect(x, W - 84, H - 70, 64, 36, 10); x.stroke(); x.fillStyle = '#2f9a4a'; x.font = '600 20px Arial, sans-serif'; x.fillText('✓', W - 58, H - 51);
}
const ready = im => im && im.complete && im.naturalWidth > 0;
function baseReady(key) { const i = SCR[key] || {}; if (key === 'result_fail') return ready(IMG['04_control_test_result']); if (i.base) return ready(MIMG[i.base]); if (i.src === 'man') return ready(MIMG[i.img]); if (i.src === 'real') return ready(IMG[key]); return true; }
/* paints a device screen into scrC (300×400); jitter = small camera-like variation */
function paintScreen(key, jitter, course) {
  const x = scrX, info = SCR[key] || {}; course = course || (C ? C.id : 'qc');
  x.save(); x.filter = 'none'; x.fillStyle = '#000'; x.fillRect(0, 0, 300, 400);
  if (jitter) { const s = 1 + Math.random() * .04, dx = (Math.random() - .5) * 8, dy = (Math.random() - .5) * 8; x.translate(150 + dx, 200 + dy); x.scale(s, s); x.translate(-150, -200); x.filter = `brightness(${(0.92 + Math.random() * .14).toFixed(2)})`; }
  if (key === 'result_fail') {
    const im = IMG['04_control_test_result']; if (ready(im)) x.drawImage(im, 0, 0, 300, 400);
    x.filter = 'none'; x.fillStyle = '#f3f6fb'; rrect(x, 18, 186, 264, 30, 9); x.fill(); x.strokeStyle = '#c0392b'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#c0392b'; x.font = '600 15px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Out of Range', 150, 201); x.textAlign = 'left';
  } else if (info.base) {
    const im = MIMG[info.base]; if (ready(im)) x.drawImage(im, 0, 0, 300, 400);
    x.filter = 'none'; x.fillStyle = '#ffffff'; x.fillRect(8, 110, 284, 66); x.fillRect(10, 184, 280, 52);
    x.fillStyle = '#1a1a1a'; x.font = '600 50px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(key === 'p_res_rr' ? 'RR HI' : 'HI', 150, 146);
    if (key === 'p_res_rr') { x.strokeStyle = '#3b5a8c'; x.lineWidth = 2; rrect(x, 26, 192, 248, 34, 13); x.stroke(); x.fillStyle = '#2b3d55'; x.font = '15px Arial, sans-serif'; x.fillText('Out of Reportable Range', 150, 209); }
    x.textAlign = 'left';
  } else if (info.src === 'syn') drawSynth(x, key, course);
  else if (info.src === 'man') { const im = MIMG[info.img]; if (ready(im)) x.drawImage(im, 0, 0, 300, 400); }
  else { const im = IMG[key]; if (ready(im)) x.drawImage(im, 0, 0, 300, 400); }
  x.restore();
}
const thumbCache = {};
function thumbURL(key) {
  const info = SCR[key]; if (!info) return null;
  if (info.src === 'real') return (window.SIM_SCREENS || {})[key] || null;
  if (info.src === 'man') return (window.MANUAL_SCREENS || {})[info.img] || null;
  const ck = key + ':' + (C ? C.id : 'qc');
  if (thumbCache[ck]) return thumbCache[ck];
  if (!baseReady(key)) return null;
  paintScreen(key, false, C ? C.id : 'qc'); return (thumbCache[ck] = scrC.toDataURL('image/jpeg', .86));
}
const thumbImgs = {};
function thumbImg(key) { const u = thumbURL(key); if (!u) return null; if (!thumbImgs[u.length + key]) { const im = new Image(); im.src = u; thumbImgs[u.length + key] = im; } return thumbImgs[u.length + key]; }
const scrList = v => v ? (Array.isArray(v) ? v : [v]) : [];

/* ---------------- headset camera ---------------- */
const IS_HEADSET = /OculusBrowser|Quest|Pico|Wolvic/i.test(navigator.userAgent);
const CAM_TRIES = IS_HEADSET
  ? [{ width: { exact: 1280 }, height: { exact: 1280 } }, { width: { exact: 1280 }, height: { exact: 960 } }, { width: { min: 960, ideal: 1280 }, height: { min: 720, ideal: 960 } }, { width: { ideal: 1280 }, height: { ideal: 960 } }, {}]
  : [{ width: { ideal: 1280 }, height: { ideal: 960 } }, {}];
const CAMINFO = { w: 0, h: 0, fps: 0 };
async function getCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(t('camNone'));
  let last = null;
  for (const c of CAM_TRIES) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ facingMode: { ideal: 'environment' }, frameRate: { ideal: 30 } }, c), audio: false });
      const tr = s.getVideoTracks()[0];
      try { const caps = tr.getCapabilities ? tr.getCapabilities() : null, cur = tr.getSettings(); if (IS_HEADSET && caps && caps.width && caps.width.max > (cur.width || 0)) await tr.applyConstraints({ width: Math.min(caps.width.max, 1280), height: Math.min(caps.height.max, 1280) }); } catch (e) {}
      const st = tr.getSettings ? tr.getSettings() : {}; Object.assign(CAMINFO, { w: st.width || 0, h: st.height || 0, fps: Math.round(st.frameRate || 0) });
      return s;
    } catch (e) { last = e; if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e; }
  }
  throw last;
}
function camInfoText(v) { const w = (v && v.videoWidth) || CAMINFO.w, h = (v && v.videoHeight) || CAMINFO.h; return w ? `${w}×${h}${CAMINFO.fps ? ' @ ' + CAMINFO.fps + 'fps' : ''}` : ''; }

/* ---------------- level / decisions / nurse ---------------- */
function setCat(id) {
  R.cat = id; const c = catOf(id);
  if (R.catTruth && id !== R.catTruth) { setMr(t('catWrong'), 'retry'); logEv('judge', R.i, { cat: id, truth: R.catTruth }); }
  else setMr((R.catTruth ? t('catRight') + ' ' : '') + L(c).act, id === 'normal' ? 'ok' : 'retry');
  R.open = null; render(); maybeAuto();
}
function nurseConfirm(key) { const [no, id] = key.split(':'); const r = rec(+no); if (r.checks[id] === 'pending') { r.checks[id] = 'ok'; R.nurse[key] = Date.now(); logEv('nurse', +no, { id }); } render(); }
function pendingList() { const out = []; for (const s of STEPS) { const r = R.rec[s.no]; if (!r) continue; for (const c of s.checks || []) if (r.checks[c.id] === 'pending') out.push({ no: s.no, c }); } return out; }

/* ---------------- videos ---------------- */
function videoURL(name) { const cfg = window.TRAINING_VIDEOS || {}; return (cfg.files && cfg.files[name]) || ((cfg.base || 'videos/') + name + (cfg.ext || '.mp4')); }
function markWatched(name) { if (R && name && !R.watched[name]) { R.watched[name] = Date.now(); logEv('video', R.i, { name }); } }
function posterURL(name) { const cfg = window.TRAINING_VIDEOS || {}; return cfg.posters === false || (cfg.files && cfg.files[name]) ? '' : (cfg.base || 'videos/') + name + '.jpg'; }

/* ---------------- render (launcher page; the training itself runs on the MR panel) ---------------- */
function renderModel() {
  const el = $('#modelState');
  if (el) { el.textContent = INF.err ? t('modelErr', INF.err) : INF.det ? t('ready') : INF.cls ? t('clsReady') : t('loading'); el.className = 'st ' + (INF.err ? 'bad' : INF.det ? 'ok' : ''); }
  if (window.QC_XR && window.QC_XR.dirty) window.QC_XR.dirty();
}
function render() {
  document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en'; document.title = S.lang === 'zh' ? 'Inform II MR 培训' : 'Inform II MR Training';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  for (const [id, l] of [['lzh', 'zh'], ['len', 'en']]) { const b = $('#' + id); if (b) b.setAttribute('aria-pressed', S.lang === l); }
  renderModel();
}
function stepsDone(run) { const c = COURSES[run.course]; return c.steps.filter(s => (run.rec[s.no] || s.folded) && completeIn(run, c, s.no)).length; }
function fmtDur(ms) { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
/* ---------------- misc ---------------- */
let actx = null;
function beep() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 2400; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.12, actx.currentTime + .01); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .12); o.start(); o.stop(actx.currentTime + .14); } catch (e) {} }
let toastT = null;
function toast(s) { const el = $('#toast'); el.textContent = s; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 1800); }
function setLang(l) { S.lang = l; LS.set('qc.lang2', l); if (R && R.mr) R.mr = null; render(); }

/* ---------------- launcher events ---------------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'lzh') return setLang('zh');
  if (b.id === 'len') return setLang('en');
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'autoIn') { CFG.auto = el.checked; LS.set('qc.auto', CFG.auto); }
  if (el.id === 'confirmIn') { CFG.confirm = el.checked; LS.set('qc.confirm', CFG.confirm); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'thIn') { CFG.th = +el.value / 100; $('#thVal').textContent = Math.round(CFG.th * 100) + '%'; LS.set('qc.th', CFG.th); }
  if (el.id === 'holdIn') { CFG.hold = +el.value; $('#holdVal').textContent = CFG.hold; LS.set('qc.hold', CFG.hold); }
});
(() => { const v = (id, f) => { const el = $('#' + id); if (el) f(el); };
  v('thIn', el => el.value = Math.round(CFG.th * 100)); v('thVal', el => el.textContent = Math.round(CFG.th * 100) + '%');
  v('holdIn', el => el.value = CFG.hold); v('holdVal', el => el.textContent = CFG.hold);
  v('autoIn', el => el.checked = CFG.auto); v('confirmIn', el => el.checked = CFG.confirm); })();

/* ---------------- boot ---------------- */
window.QC = { thAt,
  S, V, CFG, CLASSES, INF, RUNS, ROUNDS, COURSES, READ_MIN, IS_HEADSET, LS,
  get R() { return R; }, get C() { return C; }, get BY() { return BY; }, get STEPS() { return STEPS; }, get LAST() { return LAST; },
  t, L, esc, pad, ref, scrName, scrList, spec, targetsOf, visionDone, complete, mrNow, rec, pendingList, microsOf, microState, microDone, curMicro, catOf, moduleOf, stepMr,
  go, next, override, resetVision, setCheck, setCat, triggerBranch, resolveBlock, branch, microTap, microUndo, useHint, nurseConfirm,
  evaluate, render, infer, argmax, getCamera, camInfoText, toast, beep, setLang, paintScreen, thumbURL, thumbImg,
  CONFIRM_MS, VIDEO_MS, FOLLOW, startCourse, switchCourse, resetCourse, goHome, startModule, finish, videoURL, posterURL, markWatched, roundSummary, nurseConfirmLast, fmtDur, autoInfo,
};
initWorker();
render();
})();
