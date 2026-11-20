# ACCU-CHEK Inform II Mixed Reality Training

**A mixed reality training system for blood glucose meter workflows**  
**Singapore · Alexandra Hospital collaboration · Project completed and handed over 20 November 2026**

[简体中文](#中文) · [English](#english)

---

## 中文

### 项目简介

本项目是与新加坡亚历山大医院（Alexandra Hospital）合作开发的混合现实（MR）培训系统，用于探索 VR/MR 培训在商业医疗环境中的运行方式。它以 ACCU-CHEK Inform II 血糖仪为对象，通过头显中的步骤面板、短视频、简化 3D 演示和屏幕识别，引导学员练习质控测试与患者血糖测试流程。

本项目已于 **2026 年 11 月 20 日**正式交接给医院并完成。医院与新加坡国立大学（NUS）后续开展的版本属于后续工作，不属于本项目范围。

**项目制作团队：** 李远帆、ChengYi、沈忻源、张钧茜

### 功能

- **QC 质控测试**与**患者血糖测试**两门引导式课程。
- 面向 Meta Quest 3 / 3S 浏览器的 WebXR MR 面板、手柄与手势交互。
- 摄像头画面中的仪器屏幕检测与 13 类页面识别；无摄像头时可使用讲师放行流程。
- 视频示范、步骤清单、分支提示、回合总结及待护士核对项目。
- 部分步骤提供程序化 3D 动作示范。

### 快速运行

项目是静态网页，无构建步骤。开发桌面预览可在项目应用目录启动本地 HTTP 服务：

```bash
cd dist
python -m http.server 8000
```

然后打开 `http://localhost:8000`。Quest 上使用时，需要在安全来源中打开页面并允许摄像头与 WebXR 权限；可部署到 HTTPS 静态托管，也可按交接说明使用 USB 与 `adb reverse` 本地预览。首次加载会下载识别模型和运行时文件。

### 技术简介

WebXR 是浏览器提供的沉浸式 XR 接口。本项目使用 WebXR 的 `immersive-ar` 会话，在 Quest 浏览器中呈现固定于现实环境的 MR 面板，并通过手柄或手势操作；无需安装独立头显应用。页面需通过 HTTPS 或本机 localhost 打开。

屏幕识别由两阶段 ONNX 模型完成：检测模型先在摄像头画面中定位仪器屏幕并裁切，分类模型再将画面归入 13 种仪器页面类别。模型在浏览器内通过 ONNX Runtime Web 推理。模型训练使用标注的仪器屏幕图像；交接评估报告为单台仪器手机拍摄视频留出帧的离线测试结果。

### 目录结构

```text
dist/
├── index.html              启动页
├── app.js                  流程、识别状态与回合管理
├── course-qc.js            QC 课程数据
├── course-patient.js       患者课程数据
├── xr.js                   WebXR 面板与头显交互
├── fx3d.js                 程序化 3D 动画
├── infer-worker.js         浏览器端模型推理
├── models/                 ONNX 检测与分类模型
├── ort/                    ONNX Runtime Web 文件
└── videos/                 分段示范视频及封面
```

常用流程文案和步骤在 `course-qc.js` 与 `course-patient.js`；页面分类顺序在 `app.js`，必须与分类模型输出顺序保持一致。详细交接说明和维护事项见 [USER_GUIDE.zh.md](USER_GUIDE.zh.md)，其中保留了原部署包的中文使用说明。交接文件单独维护，未随本仓库发布。

### 识别评估与局限

交接材料记录的分类模型离线评估为：来自**单台仪器、手机拍摄视频**的留出帧上 top-1 准确率 98.9%。这不是头显摄像头、临床环境或临床结果上的测量，也不能代表不同仪器或病区照明条件下的表现。真实头显摄像头识别率、手部追踪可靠性和第二台仪器表现仍需验证。

识别模型判断的是仪器屏幕类别，不读取患者身份内容或血糖数值，也不替代学员或护士的身份核验、临床判断和操作核对。训练进度只保存在当前页面会话，不会上传为培训档案；本项目当前版本没有业务后端、用户登录或 LMS 集成。浏览器仍需下载模型、视频和运行资源，部分依赖来自第三方 CDN。

**本项目用于培训流程演示与评估，不用于患者照护、诊断、治疗或临床决策。** 请以医院批准的正式流程、仪器说明书和现场指导为准。

### 知识产权与许可

本仓库尚未声明开源许可证。公开可见不等于授予复制、修改、再发布或商业使用权限；后续维护者应先确认合作方、作者和第三方素材的授权，再添加明确许可证。项目涉及 ACCU-CHEK / Roche 商标及仪器相关内容，商标归其各自权利人所有；本项目不表示 Roche 背书。交接材料指出模型使用了 Ultralytics YOLO 训练，发布或提供服务前应复核相关模型、代码、视频、截图、手册素材和运行库的许可与分发条件。

---

## English

### About

This mixed reality (MR) training system was developed in collaboration with **Alexandra Hospital, Singapore**, to explore how VR/MR training can operate in commercial healthcare. It uses the ACCU-CHEK Inform II blood glucose meter and combines an in-headset step panel, short videos, lightweight 3D demonstrations, and screen recognition to guide quality control (QC) testing and patient glucose testing.

This project was completed and formally handed over to the hospital on **20 November 2026**. Any subsequent versions developed by Alexandra Hospital and the National University of Singapore (NUS) are separate follow-on work and are outside the scope of this project.

**Project team:** Li Yuanfan (李远帆), ChengYi, Shen Xinyuan (沈忻源), Zhang Junqian (张钧茜)

### Features

- Guided **QC control testing** and **patient glucose testing** courses.
- WebXR MR interface for Meta Quest 3 / 3S browsers, with controller and hand interactions.
- Camera-based meter-screen detection and 13-class screen recognition; an instructor override is available when camera recognition is unavailable.
- Video demonstrations, checklists, conditional guidance, round summaries, and items for nurse review.
- Procedural 3D demonstrations for selected steps.

### Run locally

The app is a static website and has no build step. Start a local HTTP server from the app directory:

```bash
cd dist
python -m http.server 8000
```

Open `http://localhost:8000` on desktop. On Quest, open the app from a secure context and grant camera and WebXR permissions. It can be hosted on an HTTPS static site, or previewed locally over USB with `adb reverse` as described in the handoff guide. The first launch downloads model and runtime assets.

### Technology overview

WebXR is the browser API for immersive experiences. This app uses an `immersive-ar` session to place an MR panel in the Quest browser and supports controller or hand input; no standalone headset app is required. Serve it over HTTPS or localhost.

Screen recognition uses a two-stage ONNX pipeline: a detector locates and crops the meter screen, then a classifier assigns one of 13 screen classes. Inference runs in the browser with ONNX Runtime Web. The models were trained on labelled meter-screen images; the reported evaluation is an offline held-out-frame test using phone-recorded video of one meter.

### Project layout

```text
dist/
├── index.html              Launch page
├── app.js                  Flow, recognition state, and round management
├── course-qc.js            QC course data
├── course-patient.js       Patient course data
├── xr.js                   WebXR panel and headset interactions
├── fx3d.js                 Procedural 3D animations
├── infer-worker.js         In-browser model inference
├── models/                 ONNX detector and classifier
├── ort/                    ONNX Runtime Web files
└── videos/                 Segment videos and posters
```

Course steps and copy live in `course-qc.js` and `course-patient.js`. The class order in `app.js` must match the classifier output order. See [USER_GUIDE.zh.md](USER_GUIDE.zh.md) for the existing Chinese usage guide. The handoff document is maintained separately and is not included in this repository.

### Evaluation and limitations

The handoff reports **98.9% top-1 classifier accuracy** on held-out frames from phone-recorded videos of **one meter**. This is an offline frame evaluation, not a measurement from a headset camera, clinical environment, or clinical outcome. Performance with a real headset camera, hand tracking, another meter unit, and ward lighting still needs evaluation.

The model classifies meter screens; it does not read patient identity or glucose values, and it does not replace identity checks, clinical judgment, or staff review. Training progress is kept only in the current page session; this project has no application backend, user accounts, or LMS integration. The browser still downloads models, videos, and runtime assets, and some dependencies are loaded from third-party CDNs.

**This project is for training workflow demonstration and evaluation only. Do not use for patient care, diagnosis, treatment, or clinical decision-making.** Follow the hospital-approved procedure, device instructions, and on-site supervision.

### Intellectual property and licensing

No open-source license has been declared for this repository. Public visibility does not grant permission to copy, modify, redistribute, or use the materials commercially. Future maintainers should confirm rights with the project partners, authors, and third-party rights holders before adding a license. ACCU-CHEK / Roche marks and device-related materials belong to their respective owners; this project is not endorsed by Roche. The handoff notes that Ultralytics YOLO was used to train the models. Review the licensing and redistribution terms for the models, code, videos, screenshots, manual excerpts, and runtime libraries before redistribution or service deployment.








