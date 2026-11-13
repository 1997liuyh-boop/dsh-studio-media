var e=`const rules = [\r
  {\r
    type: "input",\r
    field: "apiKey" as const,\r
    title: "API Key",\r
    value: "",\r
    props: { type: "password", showPassword: true, autocomplete: "off" },\r
  },\r
  {\r
    type: "input",\r
    field: "isOverseas" as const,\r
    title: "请求地区",\r
    value: "1",\r
    props: { placeholder: "1 为国内，2 为海外" },\r
  },\r
] as const;\r
\r
const version = "2.0.2";\r
\r
type MediaTaskData = {\r
  kind: "media";\r
  mediaType: "image" | "video";\r
  taskId: string;\r
  model: string;\r
  region: string;\r
  deadline: number;\r
};\r
\r
type ReviewTaskData = {\r
  kind: "review";\r
  mediaType: "video";\r
  taskId: string;\r
  model: string;\r
  region: string;\r
  deadline: number;\r
  body: ProviderTaskData;\r
  imageUrls: string[];\r
  reviewedUrls: string[];\r
};\r
\r
function object(value: unknown): Record<string, unknown> {\r
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("APIMart 响应格式错误");\r
  return value as Record<string, unknown>;\r
}\r
\r
function mediaUrl(input: MediaInput) {\r
  if (input.type === "url") return input.url;\r
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data;\r
  return data.startsWith("data:") ? data : \`data:\${input.mimeType};base64,\${data}\`;\r
}\r
\r
type ReferencedVideoRequest = VideoRequest & {\r
  referenceOrder?: ({ type: "image" | "video" | "audio"; index: number } | { type: "firstFrame" | "lastFrame" | "text" })[];\r
};\r
\r
function videoPrompt(request: ReferencedVideoRequest, mode: VideoMode) {\r
  const model = request.model.toLowerCase();\r
  const isFrames = mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional";\r
  return request.prompt.replace(/\\{\\{ref (\\d+)\\}\\}/g, (marker, number: string) => {\r
    const reference = request.referenceOrder?.[Number(number) - 1];\r
    if (!reference) throw new Error(\`引用标记 \${marker} 缺少素材映射，请更新视频节点或提供 referenceOrder\`);\r
    if (reference.type === "text") return \`参考 \${Number(number)}\`;\r
    if (!model.includes("seedance") && !model.includes("doubao") && !model.startsWith("wan3.") && !model.startsWith("minimax-h3")) {\r
      throw new Error(\`当前模型尚不支持转换引用标记 \${marker}，请按供应商协议编写提示词\`);\r
    }\r
    if (reference.type === "firstFrame" || reference.type === "lastFrame") {\r
      if (!isFrames || !request[reference.type]) throw new Error(\`引用标记 \${marker} 对应的首尾帧未提交\`);\r
      return reference.type === "firstFrame" ? "首帧" : "尾帧";\r
    }\r
    if (!("index" in reference)) throw new Error(\`引用标记 \${marker} 的素材类型无效\`);\r
    const media = { image: request.images, video: request.videos, audio: request.audios };\r
    const frameImage = reference.type === "image" && isFrames && !request.firstFrame && !request.lastFrame;\r
    const included = Array.isArray(mode) || (reference.type === "image" && mode === "singleImage") || (frameImage && reference.index < 2);\r
    if (!included || !Number.isSafeInteger(reference.index) || reference.index < 0 || !media[reference.type]?.[reference.index]) {\r
      throw new Error(\`引用标记 \${marker} 对应的素材未提交，请重新选择引用\`);\r
    }\r
    if (frameImage) return reference.index === 0 ? "首帧" : "尾帧";\r
    // APIMart 与 MiniMax H3 API 示例均按媒体类型计数：视频与音频同传时仍引用 Audio 1。\r
    const labels = model.startsWith("minimax-h3") ? { image: "Image ", video: "Video ", audio: "Audio " }\r
      : model.startsWith("wan3.") ? { image: "图", video: "视频", audio: "音频" }\r
      : model.includes("seedance-2.5") ? { image: "@图片", video: "@视频", audio: "@音频" }\r
      : { image: "图片", video: "视频", audio: "音频" };\r
    return \`\${labels[reference.type]}\${reference.index + 1}\`;\r
  });\r
}\r
\r
function getBaseUrl(isOverseas: string | undefined) {\r
  return isOverseas === "2" ? "https://api.apimart.ai/v1" : "https://api.apib.ai/v1";\r
}\r
\r
function wait(signal: AbortSignal, ms: number) {\r
  signal.throwIfAborted();\r
  return new Promise<void>((resolve, reject) => {\r
    const abort = () => {\r
      clearTimeout(timer);\r
      reject(signal.reason);\r
    };\r
    const timer = setTimeout(() => {\r
      signal.removeEventListener("abort", abort);\r
      resolve();\r
    }, ms);\r
    signal.addEventListener("abort", abort, { once: true });\r
  });\r
}\r
\r
/** 上传图片素材换取平台可访问的 URL；已是 URL 的输入直接透传，无需重新上传。 */\r
async function uploadImage(context: ProviderContext, apiKey: string, baseUrl: string, input: MediaInput, signal: AbortSignal): Promise<string> {\r
  if (input.type === "url") return input.url;\r
  const bytes = input.type === "binary" ? input.data : Buffer.from(input.data, "base64");\r
  const ext = input.mimeType.split("/")[1] || "png";\r
  const boundary = \`----toonflow\${Date.now().toString(16)}\${Math.random().toString(16).slice(2)}\`;\r
  const body = new Blob([\r
    \`--\${boundary}\\r\\nContent-Disposition: form-data; name="file"; filename="upload.\${ext}"\\r\\nContent-Type: \${input.mimeType}\\r\\n\\r\\n\`,\r
    new Uint8Array(bytes),\r
    \`\\r\\n--\${boundary}--\\r\\n\`,\r
  ]);\r
  const response = await context.tool.fetch(\`\${baseUrl}/uploads/images\`, {\r
    method: "POST",\r
    headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": \`multipart/form-data; boundary=\${boundary}\` },\r
    body,\r
    signal,\r
  });\r
  if (!response.ok) throw new Error(\`图片上传失败：HTTP \${response.status}\`);\r
  const result = object(await response.json());\r
  if (typeof result.url !== "string" || !result.url) throw new Error("图片上传未返回地址");\r
  return result.url;\r
}\r
\r
/** Seedance 私有素材需先提交审核，通过后才能作为参考素材使用。 */\r
async function reviewSeedanceAsset(context: ProviderContext, apiKey: string, baseUrl: string, url: string, signal: AbortSignal, data: ReviewTaskData): Promise<string> {\r
  if (url.startsWith("asset://")) return url;\r
  await context.saveTaskData?.({ ...data, kind: "submitting", taskId: "" });\r
  const submitResponse = await context.tool.fetch(\`\${baseUrl}/seedance2/private-avatar\`, {\r
    method: "POST",\r
    headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
    body: JSON.stringify({\r
      group: { name: \`toonflow-seedance-group-\${Date.now()}\`, description: "ToonFlow自动创建的Seedance素材组" },\r
      project_name: "default",\r
      asset_type: "Image",\r
      assets: [{ url, name: \`image_\${Date.now()}\` }],\r
    }),\r
    signal,\r
  });\r
  if (!submitResponse.ok) throw new Error(\`Seedance资产提交失败：HTTP \${submitResponse.status}\`);\r
  const submitResult = object(await submitResponse.json());\r
  const taskId = object(submitResult.data).id;\r
  if (!taskId) throw new Error("Seedance资产提交未返回任务ID");\r
  await context.saveTaskData?.({ ...data, taskId: String(taskId) });\r
  return pollSeedanceAsset(context, apiKey, baseUrl, String(taskId), signal);\r
}\r
\r
async function pollSeedanceAsset(context: ProviderContext, apiKey: string, baseUrl: string, taskId: string, signal: AbortSignal): Promise<string> {\r
  while (true) {\r
    const queryResponse = await context.tool.fetch(\`\${baseUrl}/tasks/\${encodeURIComponent(taskId)}\`, {\r
      headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
      signal,\r
    });\r
    if (!queryResponse.ok) throw new Error(\`审核状态查询失败：HTTP \${queryResponse.status}\`);\r
    const queryData = object(await queryResponse.json());\r
    const taskData = object(queryData.data);\r
    const status = taskData.status;\r
    if (status === "failed") throw Object.assign(new Error(context.tool.errorMessage(taskData) || "素材审核失败"), { code: "MEDIA_TASK_FAILED" });\r
    if (status === "completed") {\r
      const result = object(taskData.result ?? {});\r
      const usableAssets = Array.isArray(result.usable_assets) ? result.usable_assets : [{ asset_url: result.asset_url }];\r
      if (usableAssets.length !== 1 || Array.isArray(result.failed_assets) && result.failed_assets.length) throw new Error("素材审核未返回唯一通过的素材，已停止生成");\r
      const asset = object(usableAssets[0]);\r
      if (typeof asset.asset_url !== "string" || !asset.asset_url.startsWith("asset://") || asset.asset_url.length <= 8\r
        || asset.status !== undefined && asset.status !== "Active") throw new Error("素材审核未返回有效素材地址，已停止生成");\r
      return asset.asset_url;\r
    }\r
    await wait(signal, 3000);\r
  }\r
}\r
\r
async function pollTaskResult<T>(context: ProviderContext, baseUrl: string, apiKey: string, taskId: string, signal: AbortSignal, extract: (data: Record<string, unknown>) => T): Promise<T> {\r
  while (true) {\r
    const response = await context.tool.fetch(\`\${baseUrl}/tasks/\${encodeURIComponent(taskId)}\`, {\r
      headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
      signal,\r
    });\r
    if (!response.ok) throw new Error(\`轮询失败：HTTP \${response.status}\`);\r
    const result = object(await response.json());\r
    const data = object(result.data ?? {});\r
    const status = String(result.status ?? data.status ?? "").toLowerCase();\r
    if (status === "completed" || status === "success") return extract(data);\r
    if (status === "failed" || status === "failure") {\r
      const error = (data.error as { message?: unknown } | undefined)?.message;\r
      throw Object.assign(new Error(context.tool.errorMessage?.(result) || (typeof error === "string" ? error : "生成失败")), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    await wait(signal, 3000);\r
  }\r
}\r
\r
async function waitForMedia(context: ProviderContext, apiKey: string, data: MediaTaskData, signal: AbortSignal): Promise<MediaAsset[]> {\r
  const url = await pollTaskResult(context, getBaseUrl(data.region), apiKey, data.taskId, signal, (taskData) => {\r
    const result = object(taskData.result ?? {});\r
    const items = result[data.mediaType === "image" ? "images" : "videos"];\r
    const item = Array.isArray(items) ? object(items[0]) : undefined;\r
    const url = item && Array.isArray(item.url) ? item.url[0] : undefined;\r
    if (typeof url !== "string" || !url) throw new Error("未返回生成结果");\r
    return url;\r
  });\r
  return [{ mediaType: data.mediaType, type: "url", url }];\r
}\r
\r
async function submitVideo(context: ProviderContext, apiKey: string, body: ProviderTaskData, data: Omit<MediaTaskData, "taskId">, signal: AbortSignal): Promise<MediaAsset[]> {\r
  // ACT: 后续阶段提交前记录不确定状态；响应丢失时不能重新提交收费任务。\r
  await context.saveTaskData?.({ ...data, kind: "submitting" });\r
  const response = await context.tool.fetch(\`\${getBaseUrl(data.region)}/videos/generations\`, {\r
    method: "POST",\r
    headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
    body: JSON.stringify(body),\r
    signal,\r
  });\r
  if (!response.ok) throw new Error(\`请求失败：HTTP \${response.status}\`);\r
  const result = object(await response.json());\r
  const taskId = Array.isArray(result.data) ? object(result.data[0]).task_id : undefined;\r
  if (!taskId) throw new Error("未返回任务ID");\r
  const task = { ...data, taskId: String(taskId) };\r
  await context.saveTaskData?.(task);\r
  return waitForMedia(context, apiKey, task, signal);\r
}\r
\r
async function finishVideoReviews(context: ProviderContext, apiKey: string, data: ReviewTaskData, signal: AbortSignal): Promise<MediaAsset[]> {\r
  const reviewedUrls = [...data.reviewedUrls];\r
  const baseUrl = getBaseUrl(data.region);\r
  if (data.taskId) reviewedUrls.push(await pollSeedanceAsset(context, apiKey, baseUrl, data.taskId, signal));\r
  while (reviewedUrls.length < data.imageUrls.length) {\r
    const url = data.imageUrls[reviewedUrls.length]!;\r
    reviewedUrls.push(await reviewSeedanceAsset(context, apiKey, baseUrl, url, signal, { ...data, taskId: "", reviewedUrls: [...reviewedUrls] }));\r
  }\r
  const body = { ...data.body, image_with_roles: reviewedUrls.map((url) => ({ role: "reference_image", url })) };\r
  return submitVideo(context, apiKey, body, { kind: "media", mediaType: "video", model: data.model, region: data.region, deadline: data.deadline }, signal);\r
}\r
\r
export default {\r
  id: "apiMart",\r
  label: "APIMart",\r
  icon: "data:image/webp;base64,UklGRpQIAABXRUJQVlA4IIgIAACwJwCdASqAACoAPlEijUSjoiETXmaEOAUEsgBKAGutq3iBQiPzTvD/Mj+vX+j6z/oAf6/+q9YB6AHlyeyH/cv+N6QGYgdrH978I/Av409k/285zPLXmJ/H/tD9m/Iv80Pfv/ReAPsm/evyM9UX9x/Ir8wORqAB+O/zT+5/cV6Ff9V6AfS/+q/kB8Hf5b/evx89WTw+/oH+g9gn+O/0P/Jf4b9yf8B8Lf+R/kfy89qf5r/e/+Z/if3V+gv+Sf0b/P/3n9wv8R///rA9cP7nexn+vTR+V4OmkraZVMq5rIhIUyL2X07MSQBo+77QWRAIoVuHp/rzzwVv0zxYBFUwCERO7ihCswGefZTUQk1uVz58g++V7wHi/q2OLiXSESFir9Ns4PsSkjZJjX+tS+DpX5EfIDndDCHoZEKnskgIYKvzWkVjBIB0AAD+//DpEgr946RjeeKhsBTbm0cK0+NH/QxHB2BOq8dNEWOxNDH27ESEVFq42KWZ8KsQYtDS6d0PlPi74wG5Tz0cQZG3s3+uwP4PjbvcJ+bUYQDl5oO7/m3sFmhyj60ot+mUqaiMfn5Eq0oL/dD+PhLfyn4P+Y9QYbF/SptV3NncCl1LNuv7EpVd5R5GRikocNFGXTsds9uJ6RjmI91hAankvUh6q3112LZa2t7ilWKXCED0/PwROsZeoAndRaE+wkRsaXn25mTu6N8WOFd9yKaliSC9r/5jPuny9rD99ARWv7C5YYCSbwABND/9DgydWAqWTFlQPb9YheIAU6TwDurTBhDf0w05ueiJdHdMegIL6gTYSYO/X++YQfptKdV3FUUX+0NGlvv9vYBVMfeg3bZ/z0/+GvHxFL8jOeK8Sq4vDpTE9srgTNuEkL4k3pUJYA14OGRw/w7C2YjFz4BZecMQkSFXBn2VQDO0FQXhv/TmBDWgWjQU/rQArt/65C3NkVHAKR9mQUeny/rZrrzAyeoygeZc0S0JuehUiDQsY7ZyZPJtmtQYx5OMkE5voM+pooSERiYI3CD8FUTp3lT13WOcCgKGLwcNY+MU6PCI0PTBTNRbCsfU7VRhGoUn/7Ksa8I4fQA+w/inxoCfqquzjVkKzPlmSiiQNVsSnMKIBXDTn7nX9oqBRx9SF/sJo3YgVub5xAxqToew6JM/IYtsKG6mio/UyzS7sAlLngq2doKgqkXJ9JBAyQfZ1xgbI93CKbcboL3/rwWcRXDie/xFC40T7aDE1rAVHA5bGHeIlcSXYT2WW6xfpip9BIXWy7az8osDqzgmj3SV4doHwAQHKj8O5KG7pfR0YgDYS5zMJj+NGIZnV+PDrJ6janubAUEIaGAVT65mKgGgFGYDP/BarzKEenv5/ogonjELwr6LWt/dWfLydm+OAYEUdHlqpM2XCaPa82tnbxWrs7TkQxeE1Eciq/swH0G8JCGzXavBjMh0c2V5DpflmpirEGvvPyQQMbAdg2s3MqigKwe7LXXYsEfx17fW09QcracoD9Y1HwrtLq7I3E8JsB+tZUvpwAQ187DHAMJP/Q/doEDMqIChCDSuCA7bcw9joOhuH/yZtzRi8sQ9mf/+aXNyvsvigYw1rmQXGAphJFpjU/HKasP5Q79t1MkuxzX/7T3xDeCSNWQKXI02yzykruC/FWff8x39jPtc0UYiZH76pdnh6uOl2GfvlsFiJT2yDWOCvAj0ahuXcEU83R0cbIhqtE/ZnBxwibpO7koSSwek6pxOvAYsbm5oLwiKCzf1ffO/HampxCIcx1+Nhbfh5mIjlNsBN5xf9ZcJrhZdK3Um5aEudcNzwnlfkXsN2YT7egYLYXdPFxaIFqMgDR3C8Klj7DazJKcelr5Ylv7Lx4JhBKwjoUO3S1mjOysnY9SOBociMYiuLt49CbfdC0z7yg8RURt0v/8u6+Mr0MEDUdrE++TeUI/ErRJeYktXiOD3fRyVAlca7lr/9RCagXSaWNwfqGp6GbRs+hlHYt1ZPFyindbEDTnUjVRBJ0Wxfy6WBfyKSVay9+1pn+5v3xFjwh/jLj4jSUpQc7vfS3KGkWv6e5pmSn1Hk3QajK6vCrOYTjjFl/Ig5FtTlTFZgRM/oKPtc8H/+41dgHwLtq6ZmhevGf39cx8l69HvKKwoc+79jncnKcter+yzfpIWEAxJAw5ZrMX9iFjQ0LMRZwxadLAv5WpmryrwV0IDXVy8YqIkmDp5VPVTDVZ7e2d6BG8lG9wcUFMyDJEkC6GcSlN8unLypUWQxsI1sPyojBiZIx3/pwbJqpupg+kMEt4445IuOlPhwOr235tObJQLMZsoIYa9DIEg9up+PG3u3Apy67CzMzmCfw5wHOBqPrMMb/xnbWh0k84af83vq/8kEJQrljsP1OG65JbMYUpfwN9c74TFdRhTKEhc9WQFuSHKIYQespNSEf+OYVTwGxH8OZjGrYflIhcjVpBY4Cu116RM91fKH4PAaFsl/6ubhWrASJvtNugxJ/eKxHtxcI5ajhf3+T5BcQvEAwc9ozPUF/Ug/D7J3O12xpMtRAD0YIJ15VGOMKI1KyC1y8GNbpsV7zD/oeMAYhshQXbjAuYUOKYnPFO4sI5wAJfpKl2cz5VtagsTgRtBOqV/qcBRtUiqNO671c4D3BQi0qz62jiJDDjvsVo0g9azjkvWgqr2Zn8as3NgnlCB4g7w9zHKeGoZSAhBU1MtOyBsB3X+pEsM/AA6PCJubW9tCSWEhohtp7ANFo7d2qgDsxnq5+aAjAn2Sh9XAMqoQvMViNsHkh2qXo5yCFFeqz/u6/D+rVunoloisT7Axl/0IBPyW15Ae8AAoMUO8Om+kns6i59lP8IJ0L6RzsM5gU6FnP8Dgz/1/hTQ8+IMuP2s6mEa+LlQT6supq0cUSyxEbG5WZm0ZRh1Hg8Gx+Hn12n15EYGpbwvAAA=",\r
  version,\r
  readme: \`## APIMart\r
<svg aria-label="APIMart" role="img" viewBox="480 470 1100 1100" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; color: currentColor; width: 1.2rem; height: 1.2rem; display: inline-block; vertical-align: middle; margin-right: 6px;"><path d="M 508 528 L 509 1514 L 586 1514 L 588 1512 L 587 610 L 589 607 L 670 607 L 1022 1009 L 1027 1007 L 1388 607 L 1467 607 L 1469 609 L 1470 738 L 1469 1513 L 1551 1513 L 1551 528 L 1350 528 L 1026 901 L 841 687 L 707 528 Z" fill="currentColor"></path><path d="M 627 646 L 626 1513 L 699 1513 L 700 785 L 1008 1131 L 1025 1147 L 1359 781 L 1360 1513 L 1434 1514 L 1435 646 L 1394 647 L 1240 821 L 1024 1059 L 1009 1045 L 789 795 L 661 646 Z" fill="currentColor"></path><path d="M 732 872 L 732 1513 L 802 1514 L 805 1512 L 805 1052 L 808 1053 L 888 1145 L 1024 1293 L 1250 1047 L 1250 1513 L 1322 1514 L 1324 1512 L 1323 872 L 1304 890 L 1026 1196 L 1021 1195 Z" fill="currentColor"></path></svg>APIMart是专注AI图片/视频生成的低价API平台，GPT-Image-2低至$0.006/张，1美元可出图160+张。图片、视频一套异步API通吃，提交任务拿ID、回调取结果，跑批万张不超时、换模型不改代码。\r
\r
🔗 通过此 [注册链接](https://go.apimart.ai/gh-toonflow-app) 注册即可开用。\`,\r
  rules,\r
  models: [\r
    {\r
      id: "seedance-2.5",\r
      label: "Seedance-2.5",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      durationResolutionMap: [\r
        { duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], resolution: ["480p", "720p"] },\r
      ],\r
    },\r
    {\r
      id: "seedance-2.0",\r
      label: "Seedance-2.0",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],\r
    },\r
    {\r
      id: "seedance-2.0-fast",\r
      label: "Seedance 2.0 fast",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],\r
    },\r
    {\r
      id: "seedance-2.0-mini",\r
      label: "Seedance 2.0 mini",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],\r
    },\r
    {\r
      id: "wan3.0-video",\r
      label: "Wan3.0",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:10", "videoReference:5", "audioReference:5"]],\r
      audio: true,\r
      durationResolutionMap: [\r
        { duration: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], resolution: ["480P", "720P", "1080p"] },\r
      ],\r
    },\r
    {\r
      id: "MiniMax-H3",\r
      label: "MiniMax-H3",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["768P", "2K"] }],\r
    },\r
    { id: "seedream-5-0-lite", label: "Doubao Seedream 5.0 Lite", type: "image", mode: ["text", "singleImage", "multiReference"] },\r
    { id: "seedream-5-0-pro", label: "Doubao Seedream 5.0 Pro", type: "image", mode: ["text", "singleImage", "multiReference"] },\r
    { id: "gpt-image-2", label: "gpt-image-2", type: "image", mode: ["text", "singleImage", "multiReference"] },\r
    { id: "gemini-3-pro-image-preview", label: "Nano banana Pro", type: "image", mode: ["text", "singleImage", "multiReference"] },\r
    { id: "gemini-3.1-flash-image-preview", label: "Nano banana2", type: "image", mode: ["text", "singleImage", "multiReference"] },\r
  ] satisfies ProviderModel[],\r
  async processMedia(request: ImageRequest | VideoRequest | AudioRequest) {\r
    const isSeedanceVideo = /^(?:doubao-)?seedance-2[.-]/i.test(request.model);\r
    const adjust = async (input: MediaInput, label: string) => {\r
      if (isSeedanceVideo && input.type === "url" && /^asset:\\/\\/[^/?#\\s]+$/.test(input.url)) return input;\r
      const info = await this.tool.media.inspectImage(input);\r
      if (info.height >= 300 && info.height <= 6000) return input;\r
      const height = Math.min(6000, Math.max(300, info.height));\r
      const width = Math.max(1, Math.round(info.width * height / info.height));\r
      return this.tool.media.resizeImage(input, {\r
        width,\r
        height,\r
        format: info.format === "jpeg" ? "jpeg" : info.format === "webp" ? "webp" : "png",\r
        quality: 92,\r
      });\r
    };\r
    const media = request as ImageRequest & VideoRequest & AudioRequest;\r
    const images = media.images ? await Promise.all(media.images.map((input, index) => adjust(input, \`参考图 \${index + 1}\`))) : undefined;\r
    const mask = media.mask ? await adjust(media.mask, "蒙版") : undefined;\r
    const firstFrame = media.firstFrame ? await adjust(media.firstFrame, "首帧") : undefined;\r
    const lastFrame = media.lastFrame ? await adjust(media.lastFrame, "尾帧") : undefined;\r
    return { ...request, ...(images ? { images } : {}), ...(mask ? { mask } : {}), ...(firstFrame ? { firstFrame } : {}), ...(lastFrame ? { lastFrame } : {}) };\r
  },\r
  async generateImage(request: ImageRequest): Promise<MediaAsset[]> {\r
    const apiKey = this.config.apiKey?.trim();\r
    if (!apiKey) throw new Error("请填写 API Key");\r
    const baseUrl = getBaseUrl(this.config.isOverseas);\r
    const lowerName = request.model.toLowerCase();\r
    // ACT: 单次生成最多等待 10 分钟。\r
    const deadline = Date.now() + 10 * 60_000;\r
    const signal = AbortSignal.any([AbortSignal.timeout(10 * 60_000), ...(this.signal ? [this.signal] : [])]);\r
\r
    const imageUrls: string[] = [];\r
    for (const image of request.images ?? []) imageUrls.push(await uploadImage(this, apiKey, baseUrl, image, signal));\r
\r
    let size = (request.size ?? "2K").toUpperCase();\r
    if (lowerName.includes("seedream-5-0-lite") && size === "1K") size = "2K";\r
    else if (lowerName.includes("seedream-5-0-pro")) {\r
      if (size === "4K") size = "2K";\r
      else if (size === "2K") size = "1.5K";\r
    }\r
\r
    const response = await this.tool.fetch(\`\${baseUrl}/images/generations\`, {\r
      method: "POST",\r
      headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
      body: JSON.stringify({\r
        model: request.model,\r
        prompt: request.prompt,\r
        resolution: size,\r
        size: request.ratio,\r
        n: 1,\r
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),\r
      }),\r
      signal,\r
    });\r
    if (!response.ok) throw new Error(\`请求失败：HTTP \${response.status}\`);\r
    const data = object(await response.json());\r
    const taskId = Array.isArray(data.data) ? object(data.data[0]).task_id : undefined;\r
    if (!taskId) throw new Error("未返回任务ID");\r
    const task: MediaTaskData = { kind: "media", mediaType: "image", taskId: String(taskId), model: request.model, region: String(this.config.isOverseas) === "2" ? "2" : "1", deadline };\r
    await this.saveTaskData?.(task);\r
    return waitForMedia(this, apiKey, task, signal);\r
  },\r
  async generateVideo(request: ReferencedVideoRequest): Promise<MediaAsset[]> {\r
    const apiKey = this.config.apiKey?.trim();\r
    if (!apiKey) throw new Error("请填写 API Key");\r
    const baseUrl = getBaseUrl(this.config.isOverseas);\r
    const lowerName = request.model.toLowerCase();\r
    const mode = request.mode ?? (request.firstFrame || request.lastFrame ? "startFrameOptional"\r
      : request.videos?.length || request.audios?.length ? [] : request.images?.length ? "singleImage" : "text");\r
    const prompt = videoPrompt(request, mode);\r
    if (Array.isArray(mode) && (lowerName.includes("doubao") || lowerName.includes("seedance")) && (request.images?.length ?? 0) > 20) {\r
      throw new Error(\`单次最多提交20个素材，当前提交了\${request.images!.length}个\`);\r
    }\r
    // ACT: 单次生成最多等待 30 分钟。\r
    const deadline = Date.now() + 30 * 60_000;\r
    const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(this.signal ? [this.signal] : [])]);\r
\r
    const imageUrls: string[] = [];\r
    for (const image of request.images ?? []) imageUrls.push(await uploadImage(this, apiKey, baseUrl, image, signal));\r
    const videoUrls = (request.videos ?? []).map(mediaUrl);\r
    const audioUrls = (request.audios ?? []).map(mediaUrl);\r
    const frames = [\r
      ...(request.firstFrame ? [{ url: await uploadImage(this, apiKey, baseUrl, request.firstFrame, signal), role: "first_frame" }] : []),\r
      ...(request.lastFrame ? [{ url: await uploadImage(this, apiKey, baseUrl, request.lastFrame, signal), role: "last_frame" }] : []),\r
    ];\r
    const isFrames = mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional";\r
    const frameImages = frames.length ? frames : imageUrls.map((url, index) => ({ url, role: index === 0 ? "first_frame" : "last_frame" }));\r
\r
    const body: Record<string, unknown> = {\r
      model: request.model,\r
      prompt,\r
      duration: request.duration,\r
      resolution: request.resolution,\r
      size: request.ratio,\r
    };\r
\r
    if (lowerName.includes("wan")) {\r
      if (isFrames && frameImages.length) {\r
        body.image_with_roles = frameImages.map(({ url, role }) => ({ role, url }));\r
      } else if (Array.isArray(mode)) {\r
        body.generation_type = "reference";\r
        if (imageUrls.length) body.image_urls = imageUrls;\r
        if (videoUrls.length) body.video_urls = videoUrls;\r
        if (audioUrls.length) body.audio_urls = audioUrls;\r
      } else if (mode === "singleImage" && imageUrls.length) {\r
        body.generation_type = "reference";\r
        body.image_urls = imageUrls;\r
      }\r
    } else if (lowerName.includes("doubao") || lowerName.includes("seedance")) {\r
      if (typeof request.generateAudio === "boolean") body.generate_audio = request.generateAudio;\r
      if (Array.isArray(mode)) {\r
        if (imageUrls.length) {\r
          body.image_with_roles = imageUrls.map((url) => ({ role: "reference_image", url }));\r
        }\r
        if (videoUrls.length) body.video_urls = videoUrls;\r
        if (audioUrls.length) body.audio_urls = audioUrls;\r
      } else if (isFrames) {\r
        body.image_with_roles = frameImages.map(({ url, role }) => ({ role, url }));\r
      } else if (mode === "singleImage") {\r
        body.image_with_roles = imageUrls.map((url) => ({ role: "reference_image", url }));\r
      }\r
    } else if (lowerName.includes("minimax")) {\r
      if (Array.isArray(mode)) {\r
        if (imageUrls.length) body.image_with_roles = imageUrls.map((url) => ({ role: "reference_image", url }));\r
        if (videoUrls.length) body.video_urls = videoUrls;\r
        if (audioUrls.length) body.audio_urls = audioUrls;\r
      } else if (isFrames) {\r
        body.image_with_roles = frameImages.map(({ url, role }) => ({ role, url }));\r
      } else if (mode === "singleImage") {\r
        body.image_with_roles = imageUrls.map((url) => ({ role: "reference_image", url }));\r
      }\r
    }\r
\r
    const region = String(this.config.isOverseas) === "2" ? "2" : "1";\r
    const task: Omit<MediaTaskData, "taskId"> = { kind: "media", mediaType: "video", model: request.model, region, deadline };\r
    const savedBody = JSON.parse(JSON.stringify(body)) as ProviderTaskData;\r
    if (Array.isArray(mode) && (lowerName.includes("doubao") || lowerName.includes("seedance")) && imageUrls.length) {\r
      return finishVideoReviews(this, apiKey, { ...task, kind: "review", mediaType: "video", taskId: "", body: savedBody, imageUrls, reviewedUrls: [] }, signal);\r
    }\r
    return submitVideo(this, apiKey, savedBody, task, signal);\r
  },\r
  async resumeTask(data: ProviderTaskData): Promise<MediaAsset[]> {\r
    if (data.kind === "submitting") throw new Error("上次提交结果未知，不能自动重新提交，请先在供应商平台确认任务");\r
    if ((data.kind !== "media" && data.kind !== "review") || (data.mediaType !== "image" && data.mediaType !== "video")\r
      || typeof data.taskId !== "string" || !data.taskId || typeof data.model !== "string" || !data.model\r
      || (data.region !== "1" && data.region !== "2") || typeof data.deadline !== "number" || !Number.isFinite(data.deadline)) {\r
      throw new Error("APIMart 任务恢复数据无效");\r
    }\r
    const apiKey = this.config.apiKey?.trim();\r
    if (!apiKey) throw new Error("请填写 API Key");\r
    const signal = AbortSignal.any([AbortSignal.timeout((data.mediaType === "image" ? 10 : 30) * 60_000), ...(this.signal ? [this.signal] : [])]);\r
    if (data.kind === "media") return waitForMedia(this, apiKey, data as MediaTaskData, signal);\r
    if (data.mediaType !== "video" || !data.body || typeof data.body !== "object" || Array.isArray(data.body)\r
      || data.body.model !== data.model || !Array.isArray(data.imageUrls) || !data.imageUrls.length || !data.imageUrls.every(url => typeof url === "string" && !!url)\r
      || !Array.isArray(data.reviewedUrls) || !data.reviewedUrls.every(url => typeof url === "string" && url.startsWith("asset://"))\r
      || data.reviewedUrls.length >= data.imageUrls.length) {\r
      throw new Error("APIMart 素材审核恢复数据无效");\r
    }\r
    return finishVideoReviews(this, apiKey, data as ReviewTaskData, signal);\r
  },\r
  async updateVendor(): Promise<string> {\r
    const apiKey = this.config.apiKey?.trim();\r
    if (!apiKey) throw new Error("请填写 API Key");\r
    const baseUrl = getBaseUrl(this.config.isOverseas);\r
    const response = await this.tool.fetch(\`\${baseUrl}/vendor/downloadVendor\`, {\r
      headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
      signal: this.signal,\r
    });\r
    if (!response.ok) throw new Error(\`请求失败：HTTP \${response.status}\`);\r
    const { data } = object(await response.json());\r
    if (typeof data !== "string") throw new Error("未返回更新内容");\r
    return data;\r
  },\r
} satisfies ProviderDefinition<typeof rules>;\r
`,t=`const rules = [\r
  {\r
    type: "input",\r
    field: "apiKey" as const,\r
    title: "API Key",\r
    value: "",\r
    props: { type: "password", showPassword: true, autocomplete: "off" },\r
  },\r
  {\r
    type: "input",\r
    field: "baseUrl" as const,\r
    title: "请求地址",\r
    value: "https://metaso.cn/api/minimax",\r
    props: { placeholder: "https://metaso.cn/api/minimax" },\r
  },\r
] as const;\r
\r
const version = "2.0.2";\r
\r
type ReferencedVideoRequest = VideoRequest & {\r
  referenceOrder?: ({ type: "image" | "video" | "audio"; index: number } | { type: "firstFrame" | "lastFrame" | "text" })[];\r
};\r
\r
function videoPrompt(request: ReferencedVideoRequest, mode: VideoMode) {\r
  const isFrames = mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional";\r
  return request.prompt.replace(/\\{\\{ref (\\d+)\\}\\}/g, (marker, number: string) => {\r
    const reference = request.referenceOrder?.[Number(number) - 1];\r
    if (!reference) throw new Error(\`引用标记 \${marker} 缺少素材映射，请更新视频节点或提供 referenceOrder\`);\r
    if (reference.type === "text") return \`参考 \${Number(number)}\`;\r
    if (reference.type === "firstFrame" || reference.type === "lastFrame") {\r
      if (!isFrames || !request[reference.type]) throw new Error(\`引用标记 \${marker} 对应的首尾帧未提交\`);\r
      return reference.type === "firstFrame" ? "首帧" : "尾帧";\r
    }\r
    if (!("index" in reference)) throw new Error(\`引用标记 \${marker} 的素材类型无效\`);\r
    const media = { image: request.images, video: request.videos, audio: request.audios };\r
    const included = Array.isArray(mode) || (mode === "singleImage" && reference.type === "image");\r
    if (!included || !Number.isSafeInteger(reference.index) || reference.index < 0 || !media[reference.type]?.[reference.index]) {\r
      throw new Error(\`引用标记 \${marker} 对应的素材未提交，请重新选择引用\`);\r
    }\r
    // 秘塔官方编辑器按媒体类型分别编号：https://metaso.cn/minimax-h3\r
    const labels = { image: "图片", video: "视频", audio: "音频" };\r
    return \`\${labels[reference.type]}\${reference.index + 1}\`;\r
  });\r
}\r
\r
function mediaUrl(input: MediaInput) {\r
  if (input.type === "url") return input.url;\r
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data;\r
  return data.startsWith("data:") ? data : \`data:\${input.mimeType};base64,\${data}\`;\r
}\r
\r
function wait(signal: AbortSignal, ms: number) {\r
  signal.throwIfAborted();\r
  return new Promise<void>((resolve, reject) => {\r
    const abort = () => {\r
      clearTimeout(timer);\r
      reject(signal.reason);\r
    };\r
    const timer = setTimeout(() => {\r
      signal.removeEventListener("abort", abort);\r
      resolve();\r
    }, ms);\r
    signal.addEventListener("abort", abort, { once: true });\r
  });\r
}\r
\r
async function pollVideo(context: ProviderContext, baseUrl: string, apiKey: string, taskId: string, signal: AbortSignal): Promise<string> {\r
  while (true) {\r
    const response = await context.tool.fetch(\`\${baseUrl}/v2/query/video_generation/\${encodeURIComponent(taskId)}\`, {\r
      headers: { Authorization: \`Bearer \${apiKey}\` },\r
      signal,\r
    });\r
    if (!response.ok) throw new Error(\`查询任务失败：HTTP \${response.status}\`);\r
    const data = await response.json() as { task?: { status?: string; content?: { url?: string } } };\r
    const status = data?.task?.status;\r
    if (status === "succeeded") {\r
      const url = data.task?.content?.url;\r
      if (!url) throw new Error("视频生成成功但未返回视频地址");\r
      return url;\r
    }\r
    if (status === "failed") throw Object.assign(new Error(context.tool.errorMessage?.(data) || "视频生成失败"), { code: "MEDIA_TASK_FAILED" });\r
    await wait(signal, 5000);\r
  }\r
}\r
\r
export default {\r
  id: "metaso",\r
  label: "秘塔版MiniMax（支持30秒）",\r
  icon: "data:image/svg+xml;base64,PCEtLSBTb3VyY2U6IGh0dHBzOi8vbWV0YXNvLmNuLyAtLT4NCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iNDkiIGhlaWdodD0iMzAiIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCA0OSAzMCI+PHBhdGggZmlsbD0idXJsKCNwYWludDBfbGluZWFyXzE1NjVfMjYyNSkiIGQ9Ik0xNS44NDYgMTMuOTFhMS43NCAxLjc0IDAgMCAxIDMuMDA4IDBsOC4yMzMgMTQuMjAzYzEuMTUzIDEuOTkgMy44NjcgMi41MzQgNS43MjIuOTk1IDEuNDQ4LTEuMTk4IDEuNjUxLTMuMzQ3LjcyNC00Ljk3NUwyMC41OTUgMS44OTgiPjwvcGF0aD48cGF0aCBmaWxsPSIjMTc1Q0QzIiBkPSJtNDguMTIyIDI0LjMxNC03Ljk0LTEzLjczYy0xLjA0LTEuODEtMy4zNy0yLjQyLTUuMTc5LTEuMzhzLTIuNDIgMy4zNy0xLjM4IDUuMThsNy45NCAxMy43M2MxLjA0IDEuODA5IDMuMzcgMi40MiA1LjE3OSAxLjM3OXMyLjQyLTMuMzcgMS4zOC01LjE4TTM1LjExNiAxLjg5OWMtMS4wNC0xLjgxLTMuMzctMi40Mi01LjE4LTEuMzhzLTIuNDIgMy4zNy0xLjM4IDUuMTggMy4zNyAyLjQyIDUuMTggMS4zOGMxLjgxLTEuMDY0IDIuNDQzLTMuMzcgMS4zOC01LjE4TTE5LjIxNi41MmEzIDMgMCAwIDAtLjM2Mi0uMTgyIDMuNzUgMy43NSAwIDAgMC00LjYxNCAxLjI0NGwtLjAyMy4wMjNjLS4wMjMuMDQ1LS4wNDUuMDY4LS4wNjguMTEzcy0uMDY4LjExMy0uMDkuMTU4TDEuMTY2IDI0LjExYTQgNCAwIDAgMC0uNDk3IDEuNDAydi4wOTFhMi44IDIuOCAwIDAgMC0uMDY4LjU4OGMtLjAyMyAxLjA4Ni40MDcgMi4xNzEgMS4yODkgMi44OTUuNzI0LjYxIDEuNTYuODgyIDIuMzk4LjkwNWguMTM1YzEuMjkgMCAyLjU1Ni0uNjc5IDMuMjU3LTEuODc4bDguMzAxLTE0LjQwNyA0LjYzNy04LjAzQTMuNzggMy43OCAwIDAgMCAxOS4yMTYuNTIiPjwvcGF0aD48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5lYXJfMTU2NV8yNjI1IiB4MT0iMTUuODQ1IiB4Mj0iMzQuMDk1IiB5MT0iMTUuOTQ1IiB5Mj0iMTUuOTQ1IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agb2Zmc2V0PSIwLjE0NCIgc3RvcC1jb2xvcj0iIzE5NDE4NSI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMC4yMTgiIHN0b3AtY29sb3I9IiMxODQ5QTkiPjwvc3RvcD48c3RvcCBvZmZzZXQ9IjAuMzc1IiBzdG9wLWNvbG9yPSIjMTc1Q0QzIj48L3N0b3A+PHN0b3Agb2Zmc2V0PSIwLjU3OSIgc3RvcC1jb2xvcj0iIzE3NUNEMyI+PC9zdG9wPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzE3NUNEMyI+PC9zdG9wPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjwvc3ZnPg0K",\r
  version,\r
  readme: \`秘塔科技提供高性价比的 MiniMax H3 视频生成服务：768P 仅 0.09 元/秒，2K 仅 0.15 元/秒。支持原生 2K、音画同步，API 兼容 OpenAI 协议，同时支持 ComfyUI、无限画布，无需自行部署 GPU。\r
 \\n 👉 点击 [前往平台](https://metaso.cn/minimax-h3/?s=toon) 获取密钥\`,\r
  rules,\r
  models: [\r
    {\r
      id: "MiniMax-H3",\r
      label: "MiniMax-H3",\r
      type: "video",\r
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], resolution: ["768P", "2K"] }],\r
    },\r
  ] satisfies ProviderModel[],\r
  async generateVideo(request: ReferencedVideoRequest): Promise<MediaAsset[]> {\r
    const apiKey = this.config.apiKey?.trim();\r
    if (!apiKey) throw new Error("请填写 API Key");\r
    const baseUrl = (this.config.baseUrl?.trim() || "https://metaso.cn/api/minimax").replace(/\\/$/, "");\r
\r
    const images = (request.images ?? []).map(mediaUrl);\r
    const videos = (request.videos ?? []).map(mediaUrl);\r
    const audios = (request.audios ?? []).map(mediaUrl);\r
    const frames = [\r
      ...(request.firstFrame ? [{ url: mediaUrl(request.firstFrame), role: "first_frame" }] : []),\r
      ...(request.lastFrame ? [{ url: mediaUrl(request.lastFrame), role: "last_frame" }] : []),\r
    ];\r
    const mode =\r
      request.mode ?? (frames.length ? "startFrameOptional" : videos.length || audios.length ? [] : images.length ? "singleImage" : "text");\r
    const isFrames = mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional";\r
\r
    const content: Record<string, unknown>[] = [{ type: "text", text: videoPrompt(request, mode) }];\r
    if (Array.isArray(mode)) {\r
      images.forEach((url) => content.push({ role: "reference_image", type: "image_url", image_url: { url } }));\r
      videos.forEach((url) => content.push({ role: "reference_video", type: "video_url", video_url: { url } }));\r
      audios.forEach((url) => content.push({ role: "reference_audio", type: "audio_url", audio_url: { url } }));\r
    } else if (isFrames) {\r
      frames.forEach(({ url, role }) => content.push({ type: "image_url", image_url: { url }, role }));\r
    } else if (mode === "singleImage") {\r
      images.forEach((url) => content.push({ role: "reference_image", type: "image_url", image_url: { url } }));\r
    }\r
\r
    // ACT: 单次生成最多等待 10 分钟。\r
    const deadline = Date.now() + 10 * 60_000;\r
    const signal = AbortSignal.any([AbortSignal.timeout(10 * 60_000), ...(this.signal ? [this.signal] : [])]);\r
    const submitResponse = await this.tool.fetch(\`\${baseUrl}/v2/video_generation\`, {\r
      method: "POST",\r
      headers: { Authorization: \`Bearer \${apiKey}\`, "Content-Type": "application/json" },\r
      body: JSON.stringify({ model: request.model, duration: request.duration, resolution: request.resolution, ratio: request.ratio, content }),\r
      signal,\r
    });\r
    if (!submitResponse.ok) throw new Error(\`提交任务失败：HTTP \${submitResponse.status}\`);\r
    const submitData = await submitResponse.json() as { task_id?: string };\r
    const taskId = submitData?.task_id;\r
    if (typeof taskId !== "string" || !taskId) throw new Error("提交任务未返回任务 ID");\r
    await this.saveTaskData?.({ kind: "video", taskId, model: request.model, baseUrlHash: String(this.tool.hash(baseUrl)), deadline });\r
\r
    const videoUrl = await pollVideo(this, baseUrl, apiKey, taskId, signal);\r
    return [{ mediaType: "video", type: "url", url: videoUrl }];\r
  },\r
  async resumeTask(data: ProviderTaskData): Promise<MediaAsset[]> {\r
    const baseUrl = (this.config.baseUrl?.trim() || "https://metaso.cn/api/minimax").replace(/\\/$/, "");\r
    if (data.kind !== "video" || typeof data.taskId !== "string" || !data.taskId || typeof data.model !== "string"\r
      || data.baseUrlHash !== String(this.tool.hash(baseUrl)) || typeof data.deadline !== "number" || !Number.isFinite(data.deadline)) {\r
      throw new Error("视频任务恢复数据无效或请求地址已变更");\r
    }\r
    const apiKey = this.config.apiKey?.trim();\r
    if (!apiKey) throw new Error("请填写 API Key");\r
    // ACT: 重启后仍查询原任务；每次恢复重新限定等待时长，不把本地超时当成远端失败。\r
    const signal = AbortSignal.any([AbortSignal.timeout(10 * 60_000), ...(this.signal ? [this.signal] : [])]);\r
    const url = await pollVideo(this, baseUrl, apiKey, data.taskId, signal);\r
    return [{ mediaType: "video", type: "url", url }];\r
  },\r
} satisfies ProviderDefinition<typeof rules>;\r
`,n=`﻿/**\r
 * 优云智算 ModelVerse 媒体模型适配器\r
 *\r
 * 依据（开发者提供的平台文档：https://www.compshare.cn/docs/modelverse/models/quick-start 及各模型页）：\r
 * - 认证鉴权：请求头 Authorization: Bearer <API Key>，主地址 https://api.modelverse.cn\r
 * - 图片：OpenAI 生图 /v1/images/generations、OpenAI 编辑 /v1/images/edits、Gemini /v1beta/models/{id}:generateContent\r
 * - 视频：任务提交 /v1/tasks/submit + 状态查询 /v1/tasks/status?task_id=\r
 *\r
 * 代码按「协议」而不是按模型名分支，因此同一协议的模型以后可在界面里直接新增。\r
 */\r
\r
type MediaType = "image" | "video" | "audio";\r
\r
type ProviderFormRule = {\r
  type: string;\r
  field: string;\r
  title: string;\r
  value: unknown;\r
  props?: Record<string, unknown>;\r
};\r
\r
type ProviderModel = {\r
  id: string;\r
  label: string;\r
  type: "text" | "image" | "video" | "audio";\r
  mode?: (string | string[])[];\r
  audio?: "optional" | boolean;\r
  imageSizes?: string[];\r
  imageRatios?: string[];\r
  durationResolutionMap?: { duration: number[]; resolution: string[] }[];\r
};\r
\r
type MediaInput =\r
  | { type: "url"; url: string; mimeType?: string }\r
  | { type: "base64"; data: string; mimeType: string }\r
  | { type: "binary"; data: Uint8Array; mimeType: string };\r
\r
type MediaAsset = MediaInput & { mediaType: MediaType };\r
\r
type ImageRequest = {\r
  model: string;\r
  prompt: string;\r
  images?: MediaInput[];\r
  mask?: MediaInput;\r
  n?: number;\r
  ratio?: string;\r
  size?: string;\r
  quality?: string;\r
  outputFormat?: string;\r
  other?: Record<string, unknown>;\r
};\r
\r
type VideoRequest = {\r
  model: string;\r
  prompt: string;\r
  referenceOrder?: ({ type: "image" | "video" | "audio"; index: number } | { type: "firstFrame" | "lastFrame" | "text" })[];\r
  mode?: string | string[];\r
  images?: MediaInput[];\r
  videos?: MediaInput[];\r
  audios?: MediaInput[];\r
  firstFrame?: MediaInput;\r
  lastFrame?: MediaInput;\r
  duration?: number;\r
  ratio?: string;\r
  resolution?: string;\r
  generateAudio?: boolean;\r
  watermark?: boolean;\r
  other?: Record<string, unknown>;\r
};\r
\r
type Context = {\r
  config: { apiKey?: string; minimaxApiKey?: string };\r
  signal?: AbortSignal;\r
  saveTaskData?: (data: ProviderTaskData) => Promise<void>;\r
  tool: {\r
    fetch: typeof fetch;\r
    errorMessage(value: unknown): string;\r
    audio: {\r
      convert(input: Uint8Array, options: { format: "wav" | "mp3" }): Promise<{ data: Uint8Array; mimeType: string }>;\r
    };\r
  };\r
};\r
\r
const API_BASE = "https://api.modelverse.cn";\r
/** MiniMax H3 视频工作台（优云智算）的接口地址。 */\r
const H3_BASE = "https://cp.compshare.cn";\r
/** MiniMax H3 任务轮询间隔（文档建议 3 秒一次）。 */\r
const H3_POLL_INTERVAL = 3000;\r
/** MiniMax H3 任务总等待上限（毫秒）。 */\r
const H3_TOTAL_TIMEOUT = 1800000;\r
\r
const IMAGE_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "21:9"];\r
\r
/** 图片生成总超时（毫秒）。 */\r
const IMAGE_TIMEOUT = 300000;\r
/** 视频提交请求超时（毫秒）。 */\r
const SUBMIT_TIMEOUT = 120000;\r
/** 单个状态查询请求超时（毫秒）。 */\r
const STATUS_TIMEOUT = 60000;\r
/** 视频任务总等待上限（毫秒）。 */\r
const VIDEO_TOTAL_TIMEOUT = 1800000;\r
/** 状态轮询间隔（毫秒）。 */\r
const POLL_INTERVAL = 5000;\r
\r
/**\r
 * gpt-image-2 尺寸归一化表：界面选「比例 + 1K/2K/4K」，这里换算成平台支持的像素尺寸。\r
 * 换算规则：长边取该档基准（1K=1024、2K=2048、4K=3840），另一边按比例换算并对齐 16；\r
 * 若超过平台限制（长边 ≤ 3840、像素 655360~8294400、宽高比 ≤ 3:1），再按比例收一档。\r
 * 例：4K 的 1:1 收为 2880x2880，21:9 收为 3808x1632。\r
 */\r
const GPT_IMAGE_SIZE_MAP: Record<string, Record<string, string>> = {\r
  "1K": {\r
    "1:1": "1024x1024",\r
    "3:2": "1248x832",\r
    "2:3": "832x1248",\r
    "4:3": "1152x864",\r
    "3:4": "864x1152",\r
    "4:5": "896x1120",\r
    "5:4": "1120x896",\r
    "16:9": "1360x768",\r
    "9:16": "768x1360",\r
    "21:9": "1568x672",\r
  },\r
  "2K": {\r
    "1:1": "2048x2048",\r
    "3:2": "2496x1664",\r
    "2:3": "1664x2496",\r
    "4:3": "2368x1776",\r
    "3:4": "1776x2368",\r
    "4:5": "1856x2320",\r
    "5:4": "2320x1856",\r
    "16:9": "2736x1536",\r
    "9:16": "1536x2736",\r
    "21:9": "3136x1344",\r
  },\r
  "4K": {\r
    "1:1": "2880x2880",\r
    "3:2": "3504x2336",\r
    "2:3": "2336x3504",\r
    "4:3": "3312x2480",\r
    "3:4": "2480x3312",\r
    "4:5": "2560x3200",\r
    "5:4": "3200x2560",\r
    "16:9": "3840x2160",\r
    "9:16": "2160x3840",\r
    "21:9": "3808x1632",\r
  },\r
};\r
\r
/** 保留 HTTP 状态码，便于外层给出可读文案而不暴露原始响应体。 */\r
class RequestError extends Error {\r
  status: number;\r
\r
  constructor(status: number, message: string) {\r
    super(message);\r
    this.name = "RequestError";\r
    this.status = status;\r
  }\r
}\r
\r
/** MiniMax H3 走视频工作台接口，使用单独的一份密钥。 */\r
function isH3Model(model: string): boolean {\r
  const lower = model.toLowerCase();\r
  // 注意：ModelVerse 里也有 MiniMax-Hailuo 这样的模型，不能按 minimax 前缀判断\r
  if (lower.indexOf("hailuo") !== -1) {\r
    return false;\r
  }\r
  return lower.indexOf("minimax-h3") !== -1 || lower.indexOf("h3") !== -1;\r
}\r
\r
function normalizeKey(value: unknown): string {\r
  if (typeof value !== "string") {\r
    return "";\r
  }\r
  return value\r
    .trim()\r
    .replace(/^Bearer\\s+/i, "")\r
    .trim();\r
}\r
\r
/** ModelVerse 模型用的密钥。 */\r
function requireModelVerseKey(context: Context): string {\r
  const apiKey = normalizeKey(context.config.apiKey);\r
  if (!apiKey) {\r
    throw new Error("请先在供应商配置中填写 API Key");\r
  }\r
  return apiKey;\r
}\r
\r
/** MiniMax H3 用的密钥，与 ModelVerse 的 API Key 分开填写。 */\r
function requireH3Key(context: Context): string {\r
  const apiKey = normalizeKey(context.config.minimaxApiKey);\r
  if (!apiKey) {\r
    throw new Error("请先填写 MiniMax API Key（在优云智算视频工作台的 API 窗口创建，通常是 sk-ml- 开头）");\r
  }\r
  return apiKey;\r
}\r
\r
function authHeaders(apiKey: string): Record<string, string> {\r
  return {\r
    Authorization: "Bearer " + apiKey,\r
    "Content-Type": "application/json",\r
  };\r
}\r
\r
/**\r
 * 合并超时与外部取消信号。宿主提供 AbortSignal，\r
 * 但这里不依赖 AbortSignal.any，避免不同运行时的差异。\r
 */\r
function createSignal(context: Context, timeoutMs: number): AbortSignal {\r
  const timeoutSignal = AbortSignal.timeout(timeoutMs);\r
  const external = context.signal;\r
  if (!external) {\r
    return timeoutSignal;\r
  }\r
  const controller = new AbortController();\r
  const abort = (): void => {\r
    if (!controller.signal.aborted) {\r
      controller.abort();\r
    }\r
  };\r
  if (timeoutSignal.aborted || external.aborted) {\r
    abort();\r
    return controller.signal;\r
  }\r
  const onTimeout = (): void => abort();\r
  const onExternal = (): void => abort();\r
  timeoutSignal.addEventListener("abort", onTimeout, { once: true });\r
  external.addEventListener("abort", onExternal, { once: true });\r
  controller.signal.addEventListener(\r
    "abort",\r
    () => {\r
      timeoutSignal.removeEventListener("abort", onTimeout);\r
      external.removeEventListener("abort", onExternal);\r
    },\r
    { once: true },\r
  );\r
  return controller.signal;\r
}\r
\r
async function readErrorBody(response: { status: number; text(): Promise<string> }, tool: Context["tool"]): Promise<RequestError> {\r
  let raw = "";\r
  try {\r
    raw = await response.text();\r
  } catch {\r
    raw = "";\r
  }\r
  if (!raw) {\r
    return new RequestError(response.status, "请求失败，HTTP " + response.status);\r
  }\r
  let parsed: unknown = undefined;\r
  try {\r
    parsed = JSON.parse(raw);\r
  } catch {\r
    parsed = undefined;\r
  }\r
  if (parsed && typeof parsed === "object") {\r
    const root = parsed as Record<string, unknown>;\r
    const nested = root.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : undefined;\r
    const source = nested ?? root;\r
    const code = typeof source.code === "string" ? source.code : "";\r
    const detail = tool.errorMessage(source);\r
    if (detail && code) {\r
      return new RequestError(response.status, "请求失败，HTTP " + response.status + "（" + code + "）：" + detail);\r
    }\r
    if (detail) {\r
      return new RequestError(response.status, "请求失败，HTTP " + response.status + "：" + detail);\r
    }\r
  }\r
  return new RequestError(response.status, "请求失败，HTTP " + response.status + "：" + tool.errorMessage(raw));\r
}\r
\r
async function parseJsonBody(response: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {\r
  let payload: unknown = undefined;\r
  try {\r
    payload = await response.json();\r
  } catch {\r
    throw new Error("接口返回的内容不是有效 JSON，无法解析生成结果");\r
  }\r
  if (!payload || typeof payload !== "object") {\r
    throw new Error("接口返回结构异常，未找到生成结果");\r
  }\r
  return payload as Record<string, unknown>;\r
}\r
\r
async function requestJson(\r
  context: Context,\r
  url: string,\r
  init: { method: string; headers: Record<string, string>; body?: RequestInit["body"]; signal: AbortSignal },\r
): Promise<Record<string, unknown>> {\r
  const response = await context.tool.fetch(url, {\r
    method: init.method,\r
    headers: init.headers,\r
    body: init.body,\r
    signal: init.signal,\r
  });\r
  if (!response.ok) {\r
    throw await readErrorBody(response, context.tool);\r
  }\r
  return parseJsonBody(response);\r
}\r
\r
/** 保留本地校验文案（例如「请填写 API Key」）。 */\r
function friendlyError(error: unknown): Error {\r
  if (error instanceof RequestError) {\r
    return new Error(error.message);\r
  }\r
  if (error instanceof Error) {\r
    return error;\r
  }\r
  return new Error("调用 ModelVerse 失败，请稍后重试");\r
}\r
\r
function ensureHttpUrl(value: unknown): string {\r
  if (typeof value !== "string" || !value) {\r
    return "";\r
  }\r
  const trimmed = value.trim();\r
  let parsed: URL;\r
  try {\r
    parsed = new URL(trimmed);\r
  } catch {\r
    return "";\r
  }\r
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {\r
    return "";\r
  }\r
  return trimmed;\r
}\r
\r
function extensionOf(url: string): string {\r
  let pathname = url;\r
  try {\r
    pathname = new URL(url).pathname;\r
  } catch {\r
    pathname = url;\r
  }\r
  const matched = /\\.([a-zA-Z0-9]+)$/.exec(pathname);\r
  return matched ? matched[1].toLowerCase() : "";\r
}\r
\r
function guessMimeFromUrl(url: string, fallback: string): string {\r
  const ext = extensionOf(url);\r
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";\r
  if (ext === "png") return "image/png";\r
  if (ext === "webp") return "image/webp";\r
  if (ext === "gif") return "image/gif";\r
  if (ext === "bmp") return "image/bmp";\r
  return fallback;\r
}\r
\r
function guessAudioMimeFromUrl(url: string): string {\r
  const ext = extensionOf(url);\r
  if (ext === "wav") return "audio/wav";\r
  if (ext === "mp3") return "audio/mpeg";\r
  if (ext === "m4a") return "audio/mp4";\r
  if (ext === "aac") return "audio/aac";\r
  if (ext === "flac") return "audio/flac";\r
  if (ext === "ogg" || ext === "opus") return "audio/ogg";\r
  return "audio/mpeg";\r
}\r
\r
function decodeBase64(data: string): Uint8Array {\r
  const cleaned = data.replace(/\\s/g, "");\r
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {\r
    throw new Error("参考素材的 Base64 数据无效，无法上传给 ModelVerse");\r
  }\r
  const binary = atob(cleaned);\r
  const bytes = new Uint8Array(binary.length);\r
  for (let index = 0; index < binary.length; index += 1) {\r
    bytes[index] = binary.charCodeAt(index);\r
  }\r
  return bytes;\r
}\r
\r
function splitBase64(data: string): { mimeType: string; payload: string } {\r
  const trimmed = data.trim();\r
  const matched = /^data:([^;,]+);base64,(.*)$/i.exec(trimmed);\r
  if (matched) {\r
    return { mimeType: matched[1].toLowerCase(), payload: matched[2] };\r
  }\r
  return { mimeType: "", payload: trimmed };\r
}\r
\r
function bytesToBase64(data: Uint8Array): string {\r
  let binary = "";\r
  for (let index = 0; index < data.length; index += 1) {\r
    binary += String.fromCharCode(data[index]);\r
  }\r
  return btoa(binary);\r
}\r
\r
/** 把任何来源的素材统一成可上传字节。 */\r
async function toBinaryBytes(\r
  context: Context,\r
  input: MediaInput,\r
  timeoutMs: number,\r
  fallbackMime: string,\r
): Promise<{ data: Uint8Array; mimeType: string }> {\r
  if (input.type === "binary") {\r
    return { data: input.data, mimeType: input.mimeType || fallbackMime };\r
  }\r
  if (input.type === "base64") {\r
    const split = splitBase64(input.data);\r
    return { data: decodeBase64(split.payload), mimeType: input.mimeType || split.mimeType || fallbackMime };\r
  }\r
  const url = ensureHttpUrl(input.url);\r
  if (!url) {\r
    throw new Error("参考素材地址无效，只支持 HTTP(S) 地址或素材数据");\r
  }\r
  const response = await context.tool.fetch(url, { signal: createSignal(context, timeoutMs) });\r
  if (!response.ok) {\r
    throw new Error("读取参考素材失败，HTTP " + response.status);\r
  }\r
  const buffer = await response.arrayBuffer();\r
  const contentType = response.headers.get("content-type");\r
  const mimeType = input.mimeType || (contentType ? contentType.split(";")[0].trim() : "") || guessMimeFromUrl(url, fallbackMime);\r
  return { data: new Uint8Array(buffer), mimeType };\r
}\r
\r
/** 参考图统一成 URL 或 Data URL（文档要求 data:image/xxx;base64,... 且格式小写）。 */\r
function toImageUrl(input: MediaInput, fallbackMime: string): string {\r
  if (input.type === "url") {\r
    const url = ensureHttpUrl(input.url);\r
    if (!url) {\r
      throw new Error("参考图地址无效，只支持 HTTP(S) 地址或图片数据");\r
    }\r
    return url;\r
  }\r
  if (input.type === "base64") {\r
    const split = splitBase64(input.data);\r
    const mimeType = input.mimeType || split.mimeType || fallbackMime;\r
    return "data:" + mimeType + ";base64," + split.payload;\r
  }\r
  return "data:" + (input.mimeType || fallbackMime) + ";base64," + bytesToBase64(input.data);\r
}\r
\r
/** 参考音频：优先直接给地址，否则按文档包成 Data URL。 */\r
async function toAudioUrl(context: Context, input: MediaInput): Promise<string> {\r
  if (input.type === "url") {\r
    const url = ensureHttpUrl(input.url);\r
    if (!url) {\r
      throw new Error("参考音频地址无效，只支持 HTTP(S) 地址或音频数据");\r
    }\r
    return url;\r
  }\r
  const source = await toBinaryBytes(context, input, SUBMIT_TIMEOUT, "audio/mpeg");\r
  const declared = (source.mimeType || "audio/mpeg").toLowerCase().split(";")[0].trim();\r
  return "data:" + declared + ";base64," + bytesToBase64(source.data);\r
}\r
\r
/** 极简 multipart/form-data 构造，避免依赖宿主不保证存在的 FormData / File。 */\r
class MultipartBody {\r
  readonly boundary: string;\r
  private chunks: Uint8Array[] = [];\r
  private finished = false;\r
\r
  constructor(boundary: string) {\r
    this.boundary = boundary;\r
  }\r
\r
  appendField(name: string, value: string): void {\r
    this.pushText("--" + this.boundary + "\\r\\n");\r
    this.pushText('Content-Disposition: form-data; name="' + name + '"\\r\\n\\r\\n');\r
    this.pushText(value + "\\r\\n");\r
  }\r
\r
  appendFile(name: string, filename: string, mimeType: string, data: Uint8Array): void {\r
    this.pushText("--" + this.boundary + "\\r\\n");\r
    this.pushText('Content-Disposition: form-data; name="' + name + '"; filename="' + filename + '"\\r\\n');\r
    this.pushText("Content-Type: " + mimeType + "\\r\\n\\r\\n");\r
    this.chunks.push(data);\r
    this.pushText("\\r\\n");\r
  }\r
\r
  finish(): Uint8Array<ArrayBuffer> {\r
    if (!this.finished) {\r
      this.pushText("--" + this.boundary + "--\\r\\n");\r
      this.finished = true;\r
    }\r
    let total = 0;\r
    for (const chunk of this.chunks) {\r
      total += chunk.length;\r
    }\r
    const output = new Uint8Array(total);\r
    let offset = 0;\r
    for (const chunk of this.chunks) {\r
      output.set(chunk, offset);\r
      offset += chunk.length;\r
    }\r
    return output;\r
  }\r
\r
  private pushText(text: string): void {\r
    this.chunks.push(new TextEncoder().encode(text));\r
  }\r
}\r
\r
const MEDIA_EXTENSIONS: Record<string, string> = {\r
  "image/png": "png",\r
  "image/jpeg": "jpg",\r
  "image/webp": "webp",\r
  "image/gif": "gif",\r
  "image/bmp": "bmp",\r
};\r
\r
function extensionFor(mimeType: string, fallback: string): string {\r
  const value = MEDIA_EXTENSIONS[mimeType.toLowerCase()];\r
  return value ? value : fallback;\r
}\r
\r
function parseSizeValue(size: string): { width: number; height: number } | undefined {\r
  const matched = /^(\\d{2,5})\\s*[x*×]\\s*(\\d{2,5})$/i.exec(size.trim());\r
  if (!matched) {\r
    return undefined;\r
  }\r
  return { width: Number(matched[1]), height: Number(matched[2]) };\r
}\r
\r
function validateGptImagePixels(size: string): string {\r
  const trimmed = size.trim();\r
  const parsed = parseSizeValue(trimmed);\r
  if (!parsed) {\r
    throw new Error("这类模型的尺寸需要写成 1K、2K、4K，或 1024x1024 这样的宽x高像素值");\r
  }\r
  const { width, height } = parsed;\r
  if (width % 16 !== 0 || height % 16 !== 0) {\r
    throw new Error("这类模型的宽和高都必须是 16 的倍数");\r
  }\r
  const pixels = width * height;\r
  if (pixels < 655360 || pixels > 8294400) {\r
    throw new Error("这类模型的像素总数需在 655360 到 8294400 之间，例如 1024x1024");\r
  }\r
  const maxSide = Math.max(width, height);\r
  const minSide = Math.min(width, height);\r
  if (maxSide > 3840) {\r
    throw new Error("这类模型的宽高最大 3840 像素");\r
  }\r
  if (maxSide / minSide > 3) {\r
    throw new Error("这类模型的宽高比最大 3:1");\r
  }\r
  return width + "x" + height;\r
}\r
\r
/** 把「比例 + 1K/2K/4K」折算成 gpt-image-2 支持的像素尺寸。 */\r
function resolveGptImageSize(rawSize: string, rawRatio: string): string {\r
  const size = rawSize.trim();\r
  const ratio = rawRatio.trim();\r
  const tierKey = size.toUpperCase();\r
  const isTier = tierKey === "1K" || tierKey === "2K" || tierKey === "4K";\r
  if (size && !isTier && !parseSizeValue(size) && /^[\\d.]+k$/i.test(tierKey)) {\r
    throw new Error("这类模型的清晰度只支持 1K、2K、4K");\r
  }\r
  let effectiveRatio = ratio;\r
  if (size && !isTier && !parseSizeValue(size)) {\r
    if (ratio && ratio !== size) {\r
      throw new Error("比例和尺寸都填了，请只填一处");\r
    }\r
    effectiveRatio = size;\r
  }\r
  if (!isTier && !effectiveRatio) {\r
    return size ? validateGptImagePixels(size) : "";\r
  }\r
  const tier = isTier ? tierKey : "1K";\r
  const ratioKey = effectiveRatio || "1:1";\r
  if (IMAGE_RATIOS.indexOf(ratioKey) === -1) {\r
    throw new Error("这类模型支持的画面比例为：" + IMAGE_RATIOS.join("、"));\r
  }\r
  return GPT_IMAGE_SIZE_MAP[tier][ratioKey];\r
}\r
\r
/** Qwen 图片接口的尺寸格式是「宽*高」。 */\r
function resolveQwenSize(rawSize: string, rawRatio: string): string {\r
  const size = rawSize.trim();\r
  const ratio = rawRatio.trim();\r
  const parsed = parseSizeValue(size);\r
  if (parsed) {\r
    const pixels = parsed.width * parsed.height;\r
    if (parsed.width < 512 || parsed.height < 512 || pixels > 4194304) {\r
      throw new Error("这类模型的尺寸需在 512x512 到 2048x2048 之间");\r
    }\r
    const ratioValue = parsed.width / parsed.height;\r
    if (ratioValue < 1 / 8 || ratioValue > 8) {\r
      throw new Error("这类模型的宽高比需在 1:8 到 8:1 之间");\r
    }\r
    return parsed.width + "*" + parsed.height;\r
  }\r
  const ratioKey = size || ratio;\r
  if (!ratioKey) {\r
    return "";\r
  }\r
  if (IMAGE_RATIOS.indexOf(ratioKey) === -1) {\r
    throw new Error("这类模型支持的画面比例为：" + IMAGE_RATIOS.join("、"));\r
  }\r
  return GPT_IMAGE_SIZE_MAP["1K"][ratioKey].replace("x", "*");\r
}\r
\r
function ensureNoUnsupportedImageOptions(protocol: string, request: ImageRequest): void {\r
  if (Object.keys(request.other ?? {}).length > 0) {\r
    throw new Error("这类模型暂不支持自定义扩展参数");\r
  }\r
  if (protocol !== "gpt" && request.quality !== undefined && request.quality.trim()) {\r
    throw new Error("这类模型不支持画质档位参数");\r
  }\r
}\r
\r
/** 图片协议：gemini / gpt-image 系列 / Qwen Image 3.0 / 其它 OpenAI 兼容图片模型。 */\r
function imageProtocolOf(model: string): string {\r
  const lower = model.toLowerCase();\r
  if (lower.indexOf("gemini") !== -1) {\r
    return "gemini";\r
  }\r
  if (lower.indexOf("gpt-image") !== -1) {\r
    return "gpt";\r
  }\r
  if (lower.indexOf("qwen-image-3") !== -1) {\r
    return "qwen3";\r
  }\r
  return "openai";\r
}\r
\r
/** 视频协议：seedance / hailuo / vidu / wan。 */\r
function videoProtocolOf(model: string): string {\r
  const lower = model.toLowerCase();\r
  if (lower.indexOf("seedance") !== -1) {\r
    return "seedance";\r
  }\r
  if (lower.indexOf("hailuo") !== -1 || lower.indexOf("minimax") !== -1) {\r
    return "hailuo";\r
  }\r
  if (lower.indexOf("vidu") !== -1) {\r
    return "vidu";\r
  }\r
  if (lower.indexOf("wan") !== -1) {\r
    return "wan";\r
  }\r
  return "seedance";\r
}\r
\r
function normalizeMode(mode: string | string[] | undefined): string {\r
  if (mode === undefined) {\r
    return "";\r
  }\r
  return Array.isArray(mode) ? mode.join(",") : mode;\r
}\r
\r
function collectImageAssets(payload: Record<string, unknown>, fallbackMime: string): MediaAsset[] {\r
  const data = payload.data;\r
  if (!Array.isArray(data) || data.length === 0) {\r
    throw new Error("接口未返回生成结果");\r
  }\r
  const assets: MediaAsset[] = [];\r
  const failures: string[] = [];\r
  for (const item of data) {\r
    if (!item || typeof item !== "object") {\r
      continue;\r
    }\r
    const entry = item as Record<string, unknown>;\r
    if (entry.error && typeof entry.error === "object") {\r
      const failed = entry.error as Record<string, unknown>;\r
      failures.push(typeof failed.message === "string" ? failed.message : "接口未说明原因");\r
      continue;\r
    }\r
    const url = ensureHttpUrl(entry.url);\r
    if (url) {\r
      assets.push({ mediaType: "image", type: "url", url, mimeType: fallbackMime });\r
      continue;\r
    }\r
    const base64Value = entry.b64_json ?? entry.b64 ?? entry.base64;\r
    if (typeof base64Value === "string" && base64Value.trim()) {\r
      const split = splitBase64(base64Value);\r
      assets.push({\r
        mediaType: "image",\r
        type: "base64",\r
        data: split.payload,\r
        mimeType: split.mimeType || fallbackMime,\r
      });\r
    }\r
  }\r
  if (assets.length === 0) {\r
    if (failures.length > 0) {\r
      throw new Error("生成失败：" + failures.join("；"));\r
    }\r
    throw new Error("接口未返回可用的生成结果");\r
  }\r
  return assets;\r
}\r
\r
function collectGeminiImageAssets(payload: Record<string, unknown>): MediaAsset[] {\r
  const candidates = payload.candidates;\r
  if (!Array.isArray(candidates) || candidates.length === 0) {\r
    throw new Error("接口未返回生成结果");\r
  }\r
  const assets: MediaAsset[] = [];\r
  for (const candidate of candidates) {\r
    if (!candidate || typeof candidate !== "object") {\r
      continue;\r
    }\r
    const content = (candidate as Record<string, unknown>).content;\r
    if (!content || typeof content !== "object") {\r
      continue;\r
    }\r
    const parts = (content as Record<string, unknown>).parts;\r
    if (!Array.isArray(parts)) {\r
      continue;\r
    }\r
    for (const part of parts) {\r
      if (!part || typeof part !== "object") {\r
        continue;\r
      }\r
      const entry = part as Record<string, unknown>;\r
      // 思考过程里的中间图要跳过\r
      if (entry.thought === true) {\r
        continue;\r
      }\r
      const inline = entry.inlineData ?? entry.inline_data;\r
      if (!inline || typeof inline !== "object") {\r
        continue;\r
      }\r
      const inlineEntry = inline as Record<string, unknown>;\r
      const data = inlineEntry.data;\r
      if (typeof data !== "string" || !data.trim()) {\r
        continue;\r
      }\r
      const mimeType = typeof inlineEntry.mimeType === "string" ? inlineEntry.mimeType : "image/png";\r
      assets.push({ mediaType: "image", type: "base64", data: data.trim(), mimeType });\r
    }\r
  }\r
  if (assets.length === 0) {\r
    throw new Error("接口未返回图片，可能只返回了文字说明");\r
  }\r
  return assets;\r
}\r
\r
async function generateGeminiImage(context: Context, request: ImageRequest, apiKey: string): Promise<MediaAsset[]> {\r
  const prompt = request.prompt.trim();\r
  if (!prompt) {\r
    throw new Error("请先填写图片提示词");\r
  }\r
  const size = (request.size ?? "").trim().toUpperCase();\r
  const ratio = (request.ratio ?? "").trim();\r
  if (size && ["512", "1K", "2K", "4K"].indexOf(size) === -1) {\r
    throw new Error("这类模型的清晰度只支持 512、1K、2K、4K");\r
  }\r
  if (ratio && IMAGE_RATIOS.indexOf(ratio) === -1) {\r
    throw new Error("这类模型支持的画面比例为：" + IMAGE_RATIOS.join("、"));\r
  }\r
  const images = request.images ?? [];\r
  if (images.length > 0 || request.mask) {\r
    throw new Error("这类模型目前只支持文字生成图片，暂不能传入参考图");\r
  }\r
  const imageConfig: Record<string, unknown> = {};\r
  if (ratio) {\r
    imageConfig.aspectRatio = ratio;\r
  }\r
  if (size) {\r
    imageConfig.imageSize = size;\r
  }\r
  const generationConfig: Record<string, unknown> = { responseModalities: ["TEXT", "IMAGE"] };\r
  if (Object.keys(imageConfig).length > 0) {\r
    generationConfig.imageConfig = imageConfig;\r
  }\r
  const payload = await requestJson(context, API_BASE + "/v1beta/models/" + request.model + ":generateContent", {\r
    method: "POST",\r
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },\r
    body: JSON.stringify({\r
      contents: [{ role: "user", parts: [{ text: prompt }] }],\r
      generationConfig,\r
    }),\r
    signal: createSignal(context, IMAGE_TIMEOUT),\r
  });\r
  return collectGeminiImageAssets(payload);\r
}\r
\r
async function generateGptImage(context: Context, request: ImageRequest, apiKey: string): Promise<MediaAsset[]> {\r
  const prompt = request.prompt.trim();\r
  if (!prompt) {\r
    throw new Error("请先填写图片提示词");\r
  }\r
  if (request.n !== undefined && (request.n < 1 || request.n > 10)) {\r
    throw new Error("这类图片模型一次可生成 1 到 10 张图片");\r
  }\r
  const outputFormat = request.outputFormat ? request.outputFormat.trim().toLowerCase().replace("jpg", "jpeg") : "png";\r
  if (outputFormat !== "png" && outputFormat !== "jpeg") {\r
    throw new Error("这类模型只支持 png 或 jpeg 输出格式");\r
  }\r
  // 画质默认 medium\r
  let quality = "medium";\r
  if (request.quality !== undefined && request.quality.trim()) {\r
    quality = request.quality.trim().toLowerCase();\r
    if (quality !== "low" && quality !== "medium" && quality !== "high") {\r
      throw new Error("这类模型的画质只支持 low、medium、high");\r
    }\r
  }\r
  const size = resolveGptImageSize(request.size ?? "", request.ratio ?? "");\r
  const images = request.images ?? [];\r
  if (images.length > 1) {\r
    throw new Error("这类模型只支持传入 1 张参考图");\r
  }\r
  if (images.length === 0 && request.mask) {\r
    throw new Error("遮罩需要配合一张参考图一起使用");\r
  }\r
  const fields: Array<[string, string]> = [\r
    ["model", request.model],\r
    ["prompt", prompt],\r
  ];\r
  if (request.n !== undefined) {\r
    fields.push(["n", String(request.n)]);\r
  }\r
  if (size) {\r
    fields.push(["size", size]);\r
  }\r
  fields.push(["quality", quality]);\r
  fields.push(["output_format", outputFormat]);\r
\r
  const signal = createSignal(context, IMAGE_TIMEOUT);\r
  let payload: Record<string, unknown>;\r
  if (images.length === 1) {\r
    const main = await toBinaryBytes(context, images[0], IMAGE_TIMEOUT, "image/png");\r
    const body = new MultipartBody("----modelverse" + Date.now().toString(16) + Math.random().toString(16).slice(2, 10));\r
    body.appendFile("image", "reference." + extensionFor(main.mimeType, "png"), main.mimeType, main.data);\r
    if (request.mask) {\r
      const mask = await toBinaryBytes(context, request.mask, IMAGE_TIMEOUT, "image/png");\r
      body.appendFile("mask", "mask." + extensionFor(mask.mimeType, "png"), mask.mimeType, mask.data);\r
    }\r
    for (const field of fields) {\r
      body.appendField(field[0], field[1]);\r
    }\r
    const response = await context.tool.fetch(API_BASE + "/v1/images/edits", {\r
      method: "POST",\r
      headers: {\r
        Authorization: "Bearer " + apiKey,\r
        "Content-Type": "multipart/form-data; boundary=" + body.boundary,\r
      },\r
      body: body.finish(),\r
      signal,\r
    });\r
    if (!response.ok) {\r
      throw await readErrorBody(response, context.tool);\r
    }\r
    payload = await parseJsonBody(response);\r
  } else {\r
    const bodyObject: Record<string, unknown> = { model: request.model, prompt };\r
    if (request.n !== undefined) {\r
      bodyObject.n = request.n;\r
    }\r
    if (size) {\r
      bodyObject.size = size;\r
    }\r
    bodyObject.quality = quality;\r
    bodyObject.output_format = outputFormat;\r
    payload = await requestJson(context, API_BASE + "/v1/images/generations", {\r
      method: "POST",\r
      headers: authHeaders(apiKey),\r
      body: JSON.stringify(bodyObject),\r
      signal,\r
    });\r
  }\r
  signal.throwIfAborted();\r
  return collectImageAssets(payload, outputFormat === "jpeg" ? "image/jpeg" : "image/png");\r
}\r
\r
/**\r
 * 豆包 Seedream 系的 size 写法归一：\r
 * 官网示例里档位大小写混用（2k / 2K），像素值也允许 2048x2048、2048*2048 等写法，\r
 * 这里统一成平台推荐的 2K / 2048x2048；其它写法（例如 auto）原样透传。\r
 */\r
function normalizeSeedreamSize(size: string): string {\r
  const trimmed = size.trim();\r
  const tier = /^(\\d+(?:\\.\\d+)?)\\s*k$/i.exec(trimmed);\r
  if (tier) {\r
    return tier[1] + "K";\r
  }\r
  const parsed = parseSizeValue(trimmed);\r
  return parsed ? parsed.width + "x" + parsed.height : trimmed;\r
}\r
\r
/**\r
 * 豆包 Seedream 系「分辨率档位 + 画面比例」对应的官方像素尺寸。\r
 * 来源：火山方舟「图片生成 API」→ size 参数里“采用方式 1 时，模型实际映射的宽高像素参考值”。\r
 * 平台的图片接口只认 size，不能单独传比例，所以只要选了比例，就换成这里对应的宽高像素值提交（方式 2），\r
 * 否则比例会被平台忽略、出图和所选比例不符。\r
 */\r
const SEEDREAM_RATIO_TABLES: { pattern: RegExp; defaultTier: string; tiers: Record<string, Record<string, string>> }[] = [\r
  {\r
    // Seedream 5.0 pro（doubao-seedream-5-0-pro-260628）：档位 1K、1.5K、2K，默认 2K\r
    pattern: /seedream-5-0-pro/,\r
    defaultTier: "2K",\r
    tiers: {\r
      "1K": {\r
        "1:1": "1024x1024",\r
        "4:3": "1152x864",\r
        "3:4": "864x1152",\r
        "16:9": "1424x800",\r
        "9:16": "800x1424",\r
        "3:2": "1248x832",\r
        "2:3": "832x1248",\r
        "21:9": "1568x672",\r
      },\r
      "1.5K": {\r
        "1:1": "1536x1536",\r
        "4:3": "1792x1344",\r
        "3:4": "1344x1792",\r
        "16:9": "2048x1152",\r
        "9:16": "1152x2048",\r
        "3:2": "1872x1248",\r
        "2:3": "1248x1872",\r
        "21:9": "2352x1008",\r
      },\r
      "2K": {\r
        "1:1": "2048x2048",\r
        "4:3": "2368x1776",\r
        "3:4": "1776x2368",\r
        "16:9": "2816x1584",\r
        "9:16": "1584x2816",\r
        "3:2": "2496x1664",\r
        "2:3": "1664x2496",\r
        "21:9": "3136x1344",\r
      },\r
    },\r
  },\r
  {\r
    // Seedream 5.0 / 5.0 lite（doubao-seedream-5-0-260128）：档位 2K、3K、4K，默认 2K\r
    pattern: /seedream-5-0/,\r
    defaultTier: "2K",\r
    tiers: {\r
      "2K": {\r
        "1:1": "2048x2048",\r
        "4:3": "2304x1728",\r
        "3:4": "1728x2304",\r
        "16:9": "2848x1600",\r
        "9:16": "1600x2848",\r
        "3:2": "2496x1664",\r
        "2:3": "1664x2496",\r
        "21:9": "3136x1344",\r
      },\r
      "3K": {\r
        "1:1": "3072x3072",\r
        "4:3": "3456x2592",\r
        "3:4": "2592x3456",\r
        "16:9": "4096x2304",\r
        "9:16": "2304x4096",\r
        "3:2": "3744x2496",\r
        "2:3": "2496x3744",\r
        "21:9": "4704x2016",\r
      },\r
      "4K": {\r
        "1:1": "4096x4096",\r
        "4:3": "4704x3520",\r
        "3:4": "3520x4704",\r
        "16:9": "5504x3040",\r
        "9:16": "3040x5504",\r
        "3:2": "4992x3328",\r
        "2:3": "3328x4992",\r
        "21:9": "6240x2656",\r
      },\r
    },\r
  },\r
  {\r
    // Seedream 4.5（doubao-seedream-4.5）：档位 2K、4K\r
    pattern: /seedream-4[.\\-]?5/,\r
    defaultTier: "2K",\r
    tiers: {\r
      "2K": {\r
        "1:1": "2048x2048",\r
        "4:3": "2304x1728",\r
        "3:4": "1728x2304",\r
        "16:9": "2848x1600",\r
        "9:16": "1600x2848",\r
        "3:2": "2496x1664",\r
        "2:3": "1664x2496",\r
        "21:9": "3136x1344",\r
      },\r
      "4K": {\r
        "1:1": "4096x4096",\r
        "4:3": "4704x3520",\r
        "3:4": "3520x4704",\r
        "16:9": "5504x3040",\r
        "9:16": "3040x5504",\r
        "3:2": "4992x3328",\r
        "2:3": "3328x4992",\r
        "21:9": "6240x2656",\r
      },\r
    },\r
  },\r
  {\r
    // Seedream 4.0：档位 1K、2K、4K\r
    pattern: /seedream-4/,\r
    defaultTier: "2K",\r
    tiers: {\r
      "1K": {\r
        "1:1": "1024x1024",\r
        "4:3": "1152x864",\r
        "3:4": "864x1152",\r
        "16:9": "1280x720",\r
        "9:16": "720x1280",\r
        "3:2": "1248x832",\r
        "2:3": "832x1248",\r
        "21:9": "1512x648",\r
      },\r
      "2K": {\r
        "1:1": "2048x2048",\r
        "4:3": "2304x1728",\r
        "3:4": "1728x2304",\r
        "16:9": "2848x1600",\r
        "9:16": "1600x2848",\r
        "3:2": "2496x1664",\r
        "2:3": "1664x2496",\r
        "21:9": "3136x1344",\r
      },\r
      "4K": {\r
        "1:1": "4096x4096",\r
        "4:3": "4704x3520",\r
        "3:4": "3520x4704",\r
        "16:9": "5504x3040",\r
        "9:16": "3040x5504",\r
        "3:2": "4992x3328",\r
        "2:3": "3328x4992",\r
        "21:9": "6240x2656",\r
      },\r
    },\r
  },\r
];\r
\r
function seedreamRatioTableOf(model: string): (typeof SEEDREAM_RATIO_TABLES)[number] | undefined {\r
  const lower = model.toLowerCase();\r
  for (const entry of SEEDREAM_RATIO_TABLES) {\r
    if (entry.pattern.test(lower)) {\r
      return entry;\r
    }\r
  }\r
  return undefined;\r
}\r
\r
/** 像素值落在哪个档位：按各档 1:1 的像素总量取最接近的一档。 */\r
function closestSeedreamTier(entry: (typeof SEEDREAM_RATIO_TABLES)[number], width: number, height: number): string {\r
  const target = width * height;\r
  let best = entry.defaultTier;\r
  let bestGap = Number.POSITIVE_INFINITY;\r
  for (const tier of Object.keys(entry.tiers)) {\r
    const square = parseSizeValue(entry.tiers[tier]["1:1"]);\r
    if (!square) {\r
      continue;\r
    }\r
    const gap = Math.abs(square.width * square.height - target);\r
    if (gap < bestGap) {\r
      bestGap = gap;\r
      best = tier;\r
    }\r
  }\r
  return best;\r
}\r
\r
/**\r
 * 豆包 Seedream：把「档位（可选）+ 比例」折算成官方像素尺寸。\r
 * 比例可能放在 request.ratio，也可能被宿主塞进 request.size（界面上比例和尺寸是同一个位置），两处都认。\r
 * 返回空串表示“没选比例、不需要换算”，此时按档位或原样像素值提交。\r
 */\r
function resolveSeedreamRatioSize(model: string, rawSize: string, rawRatio: string): string {\r
  const entry = seedreamRatioTableOf(model);\r
  if (!entry) {\r
    return "";\r
  }\r
  const pixelSize = parseSizeValue(rawSize);\r
  const ratio = rawRatio.trim() || (pixelSize ? "" : /^\\d{1,2}:\\d{1,2}$/.test(rawSize.trim()) ? rawSize.trim() : "");\r
  if (!ratio) {\r
    return "";\r
  }\r
  const supported = Object.keys(entry.tiers[entry.defaultTier]);\r
  if (supported.indexOf(ratio) === -1) {\r
    throw new Error("这类模型支持的画面比例为：" + supported.join("、"));\r
  }\r
  let tier = entry.defaultTier;\r
  if (pixelSize) {\r
    // 同时给了像素值和比例：保留像素值所在的档位，只把比例换成官方值\r
    tier = closestSeedreamTier(entry, pixelSize.width, pixelSize.height);\r
  } else {\r
    const wanted = rawSize.trim().toUpperCase();\r
    if (entry.tiers[wanted]) {\r
      tier = wanted;\r
    }\r
  }\r
  return entry.tiers[tier][ratio];\r
}\r
\r
/**\r
 * 其它 OpenAI 兼容图片模型：\r
 * - seedream：size 支持分辨率档位或像素值；参考图上限 5.0 pro / flash 为 10 张，其余（5.0 lite / 4.5 / 4.0）为 14 张\r
 * - Qwen/Qwen-Image-Edit、stepfun-ai/step1x-edit：单张参考图，走 image 字段\r
 * - Qwen/Qwen-Image：纯文生图\r
 */\r
async function generateOpenAiImage(context: Context, request: ImageRequest, apiKey: string): Promise<MediaAsset[]> {\r
  const prompt = request.prompt.trim();\r
  if (!prompt) {\r
    throw new Error("请先填写图片提示词");\r
  }\r
  const lower = request.model.toLowerCase();\r
  const isSeedream = lower.indexOf("seedream") !== -1;\r
  const isStep1x = lower.indexOf("step1x") !== -1;\r
  const isQwenImageEdit = lower.indexOf("qwen-image-edit") !== -1;\r
  const singleOnly = isStep1x || isQwenImageEdit;\r
  const images = request.images ?? [];\r
  if (singleOnly && images.length > 1) {\r
    throw new Error("这类模型只支持传入 1 张参考图");\r
  }\r
  // 官网「图片生成 API」：Seedream 5.0 pro / flash 最多 10 张参考图，5.0 lite / 4.5 / 4.0 最多 14 张\r
  const seedreamMaxReferences = /seedream-5-0-(pro|flash)/.test(lower) ? 10 : 14;\r
  if (isSeedream && images.length > seedreamMaxReferences) {\r
    throw new Error("这类模型最多支持 " + seedreamMaxReferences + " 张参考图");\r
  }\r
  if (isStep1x && images.length === 0) {\r
    throw new Error("这类模型需要一张参考图");\r
  }\r
  if (isSeedream && request.n !== undefined && request.n > 1) {\r
    throw new Error("这类模型每次只生成一张图片");\r
  }\r
  const bodyObject: Record<string, unknown> = { model: request.model, prompt };\r
  if (request.n !== undefined && !isSeedream) {\r
    bodyObject.n = request.n;\r
  }\r
  const rawSize = request.size !== undefined ? request.size.trim() : "";\r
  const rawRatio = request.ratio !== undefined ? request.ratio.trim() : "";\r
  if (isSeedream) {\r
    // 选了比例就换成官方像素尺寸，否则平台的 size 只认档位/像素值，比例会被丢掉\r
    const mapped = resolveSeedreamRatioSize(lower, rawSize, rawRatio);\r
    const size = mapped || normalizeSeedreamSize(rawSize);\r
    if (size) {\r
      bodyObject.size = size;\r
    }\r
  } else if (rawSize) {\r
    bodyObject.size = rawSize;\r
  }\r
  if (images.length > 0) {\r
    const urls = images.map((image) => toImageUrl(image, "image/png"));\r
    if (singleOnly) {\r
      bodyObject.image = urls[0];\r
    } else {\r
      bodyObject.images = urls;\r
    }\r
  }\r
  if (isSeedream) {\r
    bodyObject.response_format = "url";\r
    bodyObject.watermark = false;\r
  }\r
  const payload = await requestJson(context, API_BASE + "/v1/images/generations", {\r
    method: "POST",\r
    headers: authHeaders(apiKey),\r
    body: JSON.stringify(bodyObject),\r
    signal: createSignal(context, IMAGE_TIMEOUT),\r
  });\r
  return collectImageAssets(payload, "image/png");\r
}\r
\r
/** Qwen Image 3.0：同步生图，支持 1-3 张参考图与反向提示词。 */\r
async function generateQwen3Image(context: Context, request: ImageRequest, apiKey: string): Promise<MediaAsset[]> {\r
  const prompt = request.prompt.trim();\r
  if (!prompt) {\r
    throw new Error("请先填写图片提示词");\r
  }\r
  const images = request.images ?? [];\r
  if (images.length > 3) {\r
    throw new Error("这类模型最多支持 3 张参考图");\r
  }\r
  if (request.n !== undefined && (request.n < 1 || request.n > 6)) {\r
    throw new Error("这类模型一次可生成 1 到 6 张图片");\r
  }\r
  const size = resolveQwenSize(request.size ?? "", request.ratio ?? "");\r
  const bodyObject: Record<string, unknown> = { model: request.model, prompt };\r
  if (request.n !== undefined) {\r
    bodyObject.n = request.n;\r
  }\r
  if (size) {\r
    bodyObject.size = size;\r
  }\r
  if (images.length === 1) {\r
    bodyObject.image = toImageUrl(images[0], "image/png");\r
  } else if (images.length > 1) {\r
    bodyObject.images = images.map((image) => toImageUrl(image, "image/png"));\r
  }\r
  bodyObject.watermark = false;\r
  const payload = await requestJson(context, API_BASE + "/v1/images/generations", {\r
    method: "POST",\r
    headers: authHeaders(apiKey),\r
    body: JSON.stringify(bodyObject),\r
    signal: createSignal(context, IMAGE_TIMEOUT),\r
  });\r
  return collectImageAssets(payload, "image/png");\r
}\r
\r
type VideoSkeleton = {\r
  input: Record<string, unknown>;\r
  parameters: Record<string, unknown>;\r
};\r
\r
type VideoReferenceLabels = {\r
  image: string[];\r
  video: string[];\r
  audio: string[];\r
  firstFrame?: string;\r
  lastFrame?: string;\r
};\r
\r
function referencePrompt(request: VideoRequest, labels: Partial<VideoReferenceLabels> = {}) {\r
  return request.prompt.trim().replace(/\\{\\{ref (\\d+)\\}\\}/g, (marker, number: string) => {\r
    const reference = request.referenceOrder?.[Number(number) - 1];\r
    if (!reference) throw new Error(\`引用标记 \${marker} 缺少素材映射，请更新视频节点或提供 referenceOrder\`);\r
    if (reference.type === "text") return \`参考 \${Number(number)}\`;\r
    const label =\r
      "index" in reference\r
        ? Number.isSafeInteger(reference.index) && reference.index >= 0\r
          ? labels[reference.type]?.[reference.index]\r
          : undefined\r
        : labels[reference.type];\r
    if (!label) throw new Error(\`当前模型或模式不支持引用标记 \${marker} 对应的素材，请调整提示词或生成模式\`);\r
    return label;\r
  });\r
}\r
\r
/** 豆包 Seedance 系列：content 数组 + parameters。 */\r
async function buildSeedanceBody(context: Context, request: VideoRequest): Promise<VideoSkeleton> {\r
  const mode = normalizeMode(request.mode);\r
  const images = request.images ?? [];\r
  const videos = request.videos ?? [];\r
  const audios = request.audios ?? [];\r
  const hasFirstFrame = request.firstFrame !== undefined;\r
  const hasLastFrame = request.lastFrame !== undefined;\r
  const content: Record<string, unknown>[] = [{ type: "text", text: request.prompt.trim() }];\r
  const labels: VideoReferenceLabels = { image: [], video: [], audio: [] };\r
  if (mode === "singleImage") {\r
    const firstFrame = request.firstFrame ?? images[0];\r
    if (!firstFrame) {\r
      throw new Error("这种模式需要一张首帧图片");\r
    }\r
    content.push({\r
      type: "image_url",\r
      image_url: { url: toImageUrl(firstFrame, "image/png") },\r
      role: "first_frame",\r
    });\r
    if (hasFirstFrame) labels.firstFrame = "首帧";\r
    else labels.image.push("首帧");\r
  } else if (mode === "startEndRequired" || mode === "endFrameOptional" || mode === "startFrameOptional") {\r
    if (hasFirstFrame) {\r
      content.push({\r
        type: "image_url",\r
        image_url: { url: toImageUrl(request.firstFrame as MediaInput, "image/png") },\r
        role: "first_frame",\r
      });\r
      labels.firstFrame = "首帧";\r
    }\r
    if (hasLastFrame) {\r
      content.push({\r
        type: "image_url",\r
        image_url: { url: toImageUrl(request.lastFrame as MediaInput, "image/png") },\r
        role: "last_frame",\r
      });\r
      labels.lastFrame = "尾帧";\r
    }\r
  } else if (mode.indexOf("Reference") !== -1) {\r
    for (const image of images) {\r
      content.push({ type: "image_url", image_url: { url: toImageUrl(image, "image/png") }, role: "reference_image" });\r
      labels.image.push(\`图片\${labels.image.length + 1}\`);\r
    }\r
    for (const video of videos) {\r
      const url = ensureHttpUrl(video.type === "url" ? video.url : "");\r
      if (!url) {\r
        throw new Error("参考视频目前只支持 HTTP(S) 地址");\r
      }\r
      content.push({ type: "video_url", video_url: { url }, role: "reference_video" });\r
      labels.video.push(\`视频\${labels.video.length + 1}\`);\r
    }\r
    for (const audio of audios) {\r
      content.push({ type: "audio_url", audio_url: { url: await toAudioUrl(context, audio) }, role: "reference_audio" });\r
      labels.audio.push(\`音频\${labels.audio.length + 1}\`);\r
    }\r
  } else if (hasFirstFrame || hasLastFrame || images.length > 0 || videos.length > 0 || audios.length > 0) {\r
    throw new Error("当前是纯文字生成视频模式，不能同时传入图片、视频或音频");\r
  }\r
  content[0]!.text = referencePrompt(request, request.model.toLowerCase().includes("seedance") ? labels : {});\r
  const parameters: Record<string, unknown> = {};\r
  if (request.duration !== undefined) {\r
    parameters.duration = Math.round(request.duration);\r
  }\r
  if (request.resolution !== undefined && request.resolution.trim()) {\r
    parameters.resolution = request.resolution.trim().toLowerCase();\r
  }\r
  if (request.ratio !== undefined && request.ratio.trim()) {\r
    parameters.ratio = request.ratio.trim();\r
  }\r
  if (request.generateAudio !== undefined) {\r
    parameters.generate_audio = request.generateAudio;\r
  }\r
  if (request.watermark !== undefined) {\r
    parameters.watermark = request.watermark;\r
  }\r
  return { input: { content }, parameters };\r
}\r
\r
/** MiniMax Hailuo 2.3：first_frame_image + prompt。 */\r
async function buildHailuoBody(context: Context, request: VideoRequest): Promise<VideoSkeleton> {\r
  const mode = normalizeMode(request.mode);\r
  const input: Record<string, unknown> = { prompt: referencePrompt(request) };\r
  if (mode !== "text" && request.firstFrame) {\r
    const frame = await toBinaryBytes(context, request.firstFrame, SUBMIT_TIMEOUT, "image/jpeg");\r
    input.first_frame_image = "data:" + frame.mimeType + ";base64," + bytesToBase64(frame.data);\r
  } else if (mode !== "text") {\r
    throw new Error("这种模式需要一张首帧图片");\r
  }\r
  const parameters: Record<string, unknown> = {};\r
  if (request.duration !== undefined) {\r
    parameters.duration = Math.round(request.duration);\r
  }\r
  if (request.resolution !== undefined && request.resolution.trim()) {\r
    parameters.resolution = request.resolution.trim().toUpperCase();\r
  }\r
  if (request.watermark !== undefined) {\r
    parameters.aigc_watermark = request.watermark;\r
  }\r
  return { input, parameters };\r
}\r
\r
/** Vidu 系列：按 vidu_type 区分接口类型。 */\r
async function buildViduBody(context: Context, request: VideoRequest): Promise<VideoSkeleton> {\r
  const mode = normalizeMode(request.mode);\r
  const lower = request.model.toLowerCase();\r
  const input: Record<string, unknown> = { prompt: referencePrompt(request) };\r
  const parameters: Record<string, unknown> = {};\r
  const modeLower = mode.toLowerCase();\r
  const videos = request.videos ?? [];\r
  const audios = request.audios ?? [];\r
  const isLipSync = lower.indexOf("lip-sync") !== -1;\r
  // 视频延长：模型名带 extend，或只给了参考视频（对口型要同时给音频/文字）\r
  const isExtend = lower.indexOf("extend") !== -1 || (!isLipSync && videos.length > 0 && audios.length === 0 && modeLower.indexOf("video") !== -1);\r
  // 参考图模式：模式串里出现 imageReference，或模型名带 reference 且确实给了参考图\r
  const isReference = modeLower.indexOf("imagereference") !== -1 || (lower.indexOf("reference") !== -1 && (request.images ?? []).length > 0);\r
  if (isExtend) {\r
    if (!request.videos || request.videos.length === 0) {\r
      throw new Error("视频延长需要传入一段参考视频");\r
    }\r
    const video = request.videos[0];\r
    const url = ensureHttpUrl(video.type === "url" ? video.url : "");\r
    if (!url) {\r
      throw new Error("视频延长只支持 HTTP(S) 地址的参考视频");\r
    }\r
    input.video_url = url;\r
    if (request.lastFrame) {\r
      input.last_frame_url = toImageUrl(request.lastFrame, "image/png");\r
    }\r
    parameters.vidu_type = "extend";\r
  } else if (isLipSync) {\r
    if (!request.videos || request.videos.length === 0) {\r
      throw new Error("对口型需要传入一段参考视频");\r
    }\r
    const video = request.videos[0];\r
    const url = ensureHttpUrl(video.type === "url" ? video.url : "");\r
    if (!url) {\r
      throw new Error("对口型只支持 HTTP(S) 地址的参考视频");\r
    }\r
    input.video_url = url;\r
    const text = typeof request.other?.text === "string" ? (request.other.text as string) : "";\r
    if (request.audios && request.audios.length > 0) {\r
      input.audio_url = await toAudioUrl(context, request.audios[0]);\r
    } else if (text) {\r
      input.text = text;\r
    } else {\r
      throw new Error("对口型需要一段参考音频，或一段要朗读的文字");\r
    }\r
    parameters.vidu_type = "lip-sync";\r
  } else if (isReference) {\r
    const images = request.images ?? [];\r
    if (images.length === 0) {\r
      throw new Error("参考生视频需要至少 1 张参考图");\r
    }\r
    if (images.length > 7) {\r
      throw new Error("参考生视频最多支持 7 张参考图");\r
    }\r
    input.images = images.map((image) => toImageUrl(image, "image/png"));\r
    parameters.vidu_type = "reference2video";\r
    if (request.ratio !== undefined && request.ratio.trim()) {\r
      parameters.aspect_ratio = request.ratio.trim();\r
    }\r
  } else if (mode === "startEndRequired") {\r
    if (!request.firstFrame || !request.lastFrame) {\r
      throw new Error("这种模式需要同时提供首帧和尾帧两张图片");\r
    }\r
    input.first_frame_url = toImageUrl(request.firstFrame, "image/png");\r
    input.last_frame_url = toImageUrl(request.lastFrame, "image/png");\r
    parameters.vidu_type = "start-end2video";\r
  } else if (mode === "text") {\r
    parameters.vidu_type = "text2video";\r
    if (request.ratio !== undefined && request.ratio.trim()) {\r
      parameters.aspect_ratio = request.ratio.trim();\r
    }\r
  } else {\r
    if (!request.firstFrame) {\r
      throw new Error("这种模式需要一张首帧图片");\r
    }\r
    input.first_frame_url = toImageUrl(request.firstFrame, "image/png");\r
    parameters.vidu_type = "img2video";\r
  }\r
  if (request.duration !== undefined) {\r
    parameters.duration = Math.round(request.duration);\r
  }\r
  if (request.resolution !== undefined && request.resolution.trim()) {\r
    parameters.resolution = request.resolution.trim().toLowerCase();\r
  }\r
  return { input, parameters };\r
}\r
\r
/**\r
 * 阿里 Wan 系列：i2v 用首尾帧字段，t2v 按型号用尺寸字段；\r
 * 2.5/2.6 部分型号支持参考音频。\r
 */\r
async function buildWanBody(context: Context, request: VideoRequest): Promise<VideoSkeleton> {\r
  const mode = normalizeMode(request.mode);\r
  const lower = request.model.toLowerCase();\r
  const isI2V = lower.indexOf("i2v") !== -1 || (mode !== "" && mode !== "text" && mode.indexOf("Reference") === -1);\r
  const input: Record<string, unknown> = { prompt: referencePrompt(request) };\r
  const parameters: Record<string, unknown> = {};\r
  if (isI2V) {\r
    if (!request.firstFrame) {\r
      throw new Error("这种模式需要一张首帧图片");\r
    }\r
    input.first_frame_url = toImageUrl(request.firstFrame, "image/png");\r
    if (request.lastFrame && lower.indexOf("wan2.2-i2v") !== -1) {\r
      input.last_frame_url = toImageUrl(request.lastFrame, "image/png");\r
    }\r
  }\r
  if (request.audios && request.audios.length > 0) {\r
    input.audio_url = await toAudioUrl(context, request.audios[0]);\r
  }\r
  // 文生视频型号按尺寸选择画面：优先用扩展参数里的 size，否则按清晰度档位取常用尺寸。\r
  if (!isI2V) {\r
    const explicitSize = typeof request.other?.size === "string" ? (request.other.size as string).trim() : "";\r
    const resolution = (request.resolution ?? "").trim().toUpperCase();\r
    const fallback = resolution === "1080P" ? "1920x1080" : resolution === "480P" ? "832x480" : "1280x720";\r
    const size = explicitSize || fallback;\r
    if (parseSizeValue(size)) {\r
      parameters.size = size;\r
    }\r
    const ratioKey = (request.ratio ?? "").trim();\r
    if (ratioKey === "9:16") {\r
      const parts = size.split(/[x*×]/i);\r
      parameters.size = parts[1] + "x" + parts[0];\r
    }\r
  }\r
  if (request.resolution !== undefined && request.resolution.trim()) {\r
    parameters.resolution = request.resolution.trim().toUpperCase();\r
  }\r
  if (request.duration !== undefined) {\r
    parameters.duration = Math.round(request.duration);\r
  }\r
  return { input, parameters };\r
}\r
\r
type TaskHandle = {\r
  taskId: string;\r
  apiKey: string;\r
};\r
\r
/** 提交通用异步任务（图片任务与视频任务共用）。 */\r
async function submitTask(context: Context, body: unknown, apiKey: string): Promise<TaskHandle> {\r
  const payload = await requestJson(context, API_BASE + "/v1/tasks/submit", {\r
    method: "POST",\r
    headers: authHeaders(apiKey),\r
    body: JSON.stringify(body),\r
    signal: createSignal(context, SUBMIT_TIMEOUT),\r
  });\r
  const output = payload.output && typeof payload.output === "object" ? (payload.output as Record<string, unknown>) : undefined;\r
  const taskId = output && typeof output.task_id === "string" ? output.task_id : "";\r
  if (!taskId) {\r
    throw new Error("提交任务失败：接口未返回任务编号");\r
  }\r
  return { taskId, apiKey };\r
}\r
\r
/** 轮询任务直到完成，返回结果地址列表。 */\r
async function waitForTask(context: Context, handle: TaskHandle, totalTimeout: number): Promise<string[]> {\r
  const deadline = Date.now() + totalTimeout;\r
  while (true) {\r
    if (context.signal?.aborted) {\r
      throw new Error("已取消等待生成结果，远端任务可能仍在运行");\r
    }\r
    if (Date.now() >= deadline) {\r
      throw new Error("等待生成结果超时，可以稍后重新发起");\r
    }\r
    const statusPayload = await requestJson(context, API_BASE + "/v1/tasks/status?task_id=" + encodeURIComponent(handle.taskId), {\r
      method: "GET",\r
      headers: authHeaders(handle.apiKey),\r
      signal: createSignal(context, STATUS_TIMEOUT),\r
    });\r
    const output = statusPayload.output && typeof statusPayload.output === "object" ? (statusPayload.output as Record<string, unknown>) : undefined;\r
    const status = output && typeof output.task_status === "string" ? output.task_status : "";\r
    if (status === "Success") {\r
      const urls = output && Array.isArray(output.urls) ? output.urls : [];\r
      const valid = urls.map((value) => ensureHttpUrl(value)).filter((value) => Boolean(value));\r
      if (valid.length === 0) {\r
        throw new Error("任务已完成，但没有返回可用的结果地址");\r
      }\r
      return valid;\r
    }\r
    if (status === "Failure") {\r
      const reason = output && typeof output.error_message === "string" ? output.error_message : "接口未说明原因";\r
      throw Object.assign(new Error("生成失败：" + reason), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    if (status === "Expired") {\r
      throw Object.assign(new Error("任务已过期，请重新发起"), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    if (status === "Cancelled" || status === "Canceled") {\r
      throw Object.assign(new Error("任务已被取消"), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    // 除上述终态外都按「还在处理中」继续轮询（例如平台新增的 moderating 之类状态），\r
    // 避免因为状态名不认识就提前报错；真正的失败仍由 Failure/Expired 分支处理。\r
    await new Promise<void>((resolve) => {\r
      const timer = setTimeout(resolve, POLL_INTERVAL);\r
      context.signal?.addEventListener(\r
        "abort",\r
        () => {\r
          clearTimeout(timer);\r
          resolve();\r
        },\r
        { once: true },\r
      );\r
    });\r
  }\r
}\r
\r
async function runVideoTask(context: Context, request: VideoRequest, apiKey: string, skeleton: VideoSkeleton): Promise<MediaAsset[]> {\r
  const handle = await submitTask(context, { model: request.model, input: skeleton.input, parameters: skeleton.parameters }, apiKey);\r
  await context.saveTaskData?.({ kind: "modelVerseVideo", taskId: handle.taskId, model: request.model, deadline: Date.now() + VIDEO_TOTAL_TIMEOUT });\r
  const urls = await waitForTask(context, handle, VIDEO_TOTAL_TIMEOUT);\r
  return urls.map((url) => ({ mediaType: "video" as MediaType, type: "url" as const, url, mimeType: "" }));\r
}\r
\r
/** MiniMax H3：https://cp.compshare.cn/minimax/v2，content 数组 + 顶层参数。 */\r
async function buildH3Content(context: Context, request: VideoRequest, content: Record<string, unknown>[]): Promise<VideoReferenceLabels> {\r
  const mode = normalizeMode(request.mode);\r
  const modeLower = mode.toLowerCase();\r
  const images = request.images ?? [];\r
  const videos = request.videos ?? [];\r
  const audios = request.audios ?? [];\r
  const labels: VideoReferenceLabels = { image: [], video: [], audio: [] };\r
  const isReference = modeLower.indexOf("reference") !== -1 || images.length > 1 || videos.length > 0 || audios.length > 0;\r
  if (isReference) {\r
    if (images.length > 9) {\r
      throw new Error("MiniMax H3 最多支持 9 张参考图");\r
    }\r
    if (videos.length > 3) {\r
      throw new Error("MiniMax H3 最多支持 3 个参考视频");\r
    }\r
    if (audios.length > 3) {\r
      throw new Error("MiniMax H3 最多支持 3 段参考音频");\r
    }\r
    if (images.length + videos.length + audios.length > 12) {\r
      throw new Error("MiniMax H3 的参考素材合计最多 12 个");\r
    }\r
    if (audios.length > 0 && images.length === 0 && videos.length === 0) {\r
      throw new Error("参考音频不能单独使用，请同时提供至少一张参考图或一个参考视频");\r
    }\r
    for (const image of images) {\r
      content.push({ type: "image_url", image_url: { url: toImageUrl(image, "image/png") }, role: "reference_image" });\r
      labels.image.push(\`<Picture \${labels.image.length + 1}>\`);\r
    }\r
    for (const video of videos) {\r
      const url = ensureHttpUrl(video.type === "url" ? video.url : "");\r
      if (!url) {\r
        throw new Error("MiniMax H3 的参考视频目前只支持 HTTP(S) 地址");\r
      }\r
      content.push({ type: "video_url", video_url: { url }, role: "reference_video" });\r
      labels.video.push(\`<Video \${labels.video.length + 1}>\`);\r
    }\r
    for (const audio of audios) {\r
      content.push({ type: "audio_url", audio_url: { url: await toAudioUrl(context, audio) }, role: "reference_audio" });\r
      labels.audio.push(\`<Audio \${labels.audio.length + 1}>\`);\r
    }\r
    return labels;\r
  }\r
  // 首尾帧模式：最多一张首帧 + 一张尾帧，且不能与参考素材混用\r
  if (request.firstFrame) {\r
    content.push({ type: "image_url", image_url: { url: toImageUrl(request.firstFrame, "image/png") }, role: "first_frame" });\r
    labels.firstFrame = "首帧";\r
  }\r
  if (request.lastFrame) {\r
    content.push({ type: "image_url", image_url: { url: toImageUrl(request.lastFrame, "image/png") }, role: "last_frame" });\r
    labels.lastFrame = "尾帧";\r
  }\r
  if (!request.firstFrame && !request.lastFrame && images.length > 0) {\r
    content.push({ type: "image_url", image_url: { url: toImageUrl(images[0], "image/png") }, role: "first_frame" });\r
    labels.image.push("首帧");\r
  }\r
  return labels;\r
}\r
\r
async function generateH3Video(context: Context, request: VideoRequest, apiKey: string): Promise<MediaAsset[]> {\r
  const prompt = request.prompt ? request.prompt.trim() : "";\r
  const images = request.images ?? [];\r
  const videos = request.videos ?? [];\r
  const audios = request.audios ?? [];\r
  const hasFrame = request.firstFrame !== undefined || request.lastFrame !== undefined;\r
  if (!prompt && !hasFrame && images.length === 0 && videos.length === 0 && audios.length === 0) {\r
    throw new Error("请先填写视频提示词，或提供首帧/参考素材");\r
  }\r
  if (request.duration !== undefined && (request.duration < 4 || request.duration > 30)) {\r
    throw new Error("MiniMax H3 的视频时长需要在 4 到 30 秒之间");\r
  }\r
  const resolutions = ["480P", "768P", "1080P", "2K", "4K"];\r
  let resolution = "768P";\r
  if (request.resolution !== undefined && request.resolution.trim()) {\r
    resolution = request.resolution.trim().toUpperCase();\r
    if (resolutions.indexOf(resolution) === -1) {\r
      throw new Error("MiniMax H3 的分辨率只支持 480P、768P、1080P、2K、4K");\r
    }\r
  }\r
  const ratios = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];\r
  let ratio = "";\r
  if (request.ratio !== undefined && request.ratio.trim()) {\r
    ratio = request.ratio.trim();\r
    if (ratios.indexOf(ratio) === -1) {\r
      throw new Error("MiniMax H3 的画面比例只支持 adaptive、21:9、16:9、4:3、1:1、3:4、9:16");\r
    }\r
  }\r
  const other = request.other ?? {};\r
  const content: Record<string, unknown>[] = [];\r
  if (prompt) {\r
    content.push({ type: "text", text: prompt });\r
  }\r
  const labels = await buildH3Content(context, request, content);\r
  if (prompt) content[0]!.text = referencePrompt(request, labels);\r
  const body: Record<string, unknown> = {\r
    model: request.model,\r
    content,\r
    resolution,\r
    duration: request.duration !== undefined ? Math.round(request.duration) : 5,\r
  };\r
  if (ratio) {\r
    body.ratio = ratio;\r
  }\r
  // 提示词优化、Skill、静音、水印等按平台默认；如需开启可通过扩展参数传入\r
  if (other.use_context_ir === true) {\r
    body.use_context_ir = true;\r
    if (typeof other.skill_id === "string" && other.skill_id) {\r
      body.skill_id = other.skill_id;\r
    }\r
  }\r
  if (other.mute_audio === true) {\r
    body.mute_audio = true;\r
  }\r
  if (request.watermark !== undefined) {\r
    body.aigc_watermark = request.watermark;\r
  } else if (other.aigc_watermark === true) {\r
    body.aigc_watermark = true;\r
  }\r
\r
  const submitPayload = await requestJson(context, H3_BASE + "/minimax/v2/video_generation", {\r
    method: "POST",\r
    headers: authHeaders(apiKey),\r
    body: JSON.stringify(body),\r
    signal: createSignal(context, SUBMIT_TIMEOUT),\r
  });\r
  const taskId = typeof submitPayload.task_id === "string" ? submitPayload.task_id : "";\r
  if (!taskId) {\r
    throw new Error("提交 MiniMax H3 任务失败：接口未返回任务编号");\r
  }\r
  await context.saveTaskData?.({ kind: "h3Video", taskId, model: request.model, deadline: Date.now() + H3_TOTAL_TIMEOUT });\r
  return waitForH3Video(context, taskId, apiKey);\r
}\r
\r
async function waitForH3Video(context: Context, taskId: string, apiKey: string): Promise<MediaAsset[]> {\r
  const deadline = Date.now() + H3_TOTAL_TIMEOUT;\r
  while (true) {\r
    if (context.signal?.aborted) {\r
      throw new Error("已取消等待视频生成结果，远端任务可能仍在运行");\r
    }\r
    if (Date.now() >= deadline) {\r
      throw new Error("等待 MiniMax H3 视频结果超时，可以稍后重新发起");\r
    }\r
    await new Promise<void>((resolve) => {\r
      const timer = setTimeout(resolve, H3_POLL_INTERVAL);\r
      context.signal?.addEventListener(\r
        "abort",\r
        () => {\r
          clearTimeout(timer);\r
          resolve();\r
        },\r
        { once: true },\r
      );\r
    });\r
    if (context.signal?.aborted) {\r
      throw new Error("已取消等待视频生成结果，远端任务可能仍在运行");\r
    }\r
    const statusPayload = await requestJson(context, H3_BASE + "/minimax/v2/query/video_generation/" + encodeURIComponent(taskId), {\r
      method: "GET",\r
      headers: authHeaders(apiKey),\r
      signal: createSignal(context, STATUS_TIMEOUT),\r
    });\r
    const task = statusPayload.task && typeof statusPayload.task === "object" ? (statusPayload.task as Record<string, unknown>) : undefined;\r
    const status = task && typeof task.status === "string" ? task.status : "";\r
    if (status === "succeeded") {\r
      const contentField = task && task.content && typeof task.content === "object" ? (task.content as Record<string, unknown>) : undefined;\r
      const url = contentField ? ensureHttpUrl(contentField.url) : "";\r
      if (!url) {\r
        throw new Error("MiniMax H3 任务已完成，但没有返回可用的视频地址");\r
      }\r
      return [{ mediaType: "video" as MediaType, type: "url" as const, url, mimeType: "" }];\r
    }\r
    if (status === "failed") {\r
      const failed = task && task.error && typeof task.error === "object" ? (task.error as Record<string, unknown>) : undefined;\r
      const reason = failed && typeof failed.message === "string" ? failed.message : "接口未说明原因";\r
      throw Object.assign(new Error("MiniMax H3 生成失败：" + reason), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    if (status === "cancelled") {\r
      throw Object.assign(new Error("MiniMax H3 任务已被取消"), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    if (status === "blocked") {\r
      const blocked = task && task.error && typeof task.error === "object" ? (task.error as Record<string, unknown>) : undefined;\r
      const reason = blocked && typeof blocked.message === "string" ? blocked.message : "内容未通过审核";\r
      throw Object.assign(new Error("MiniMax H3 任务被审核拦截：" + reason), { code: "MEDIA_TASK_FAILED" });\r
    }\r
    // 其余状态（queued、running、moderating 等，含平台后续新增的排队/审核阶段）继续轮询，\r
    // 直到成功、失败、被拦截，或到达总等待上限。\r
  }\r
}\r
\r
export default {\r
  id: "compshare",\r
  label: "优云智算（支持30秒）",\r
  icon: "data:image/webp;base64,UklGRrIEAABXRUJQVlA4IKYEAACwHACdASqAAIAAPlEojkWjoqEUC4RUOAUEsZOACshg/IF9F9uuYENt15fvulv4nP+S/lfYO8xX7AetJ6L/QA/wHUO7xj+53oq3hpXLaX9PfNP8g2oN0ryI5xH8WBNYIxASaOpGWbHVhMRvffDAog2oVmCU+vla84NqXJGiLa51ZBlAnajgeDd5xodsqvUvGQfQhlnkJxos+18ksB+mszh7/L8eLkBBsP2HJaoWAYw8k1/nKoCh+S0qFY6+Iwg/Y09tMNh556MM9Z7/L7WQVU4ouPEscY/0ALZJhZ4tei+xRl6IertQnQqW/PgUJmcsAP79nJzusj9cFOfFWwhdNAIFr9+vv1hhKikDp6WFkU203jKYviAGyS+J4uQtQUMoW8aQAwghvdtOP93MJ6wasAcPa6A5QwIqRezhlJCfwV1ugcHA1WdIWulOwYn/y4MILLfa51Q6vXXxuYe/kZUMvkpa3aaHl4fsX6zrQSZY5qzPmpPpZ+1tFYDJP/y/rh6h9rK1aT/lQnX/FeSk4OO5/2WjXL0vWqVCWw1Kr29QxfQFaxM9noNALm8zW6Hk0JQLdUuBTtG7r7fPZV1fEybTq9WW9tzGReXxpYvi6RypTxLrAQC1O5d385YWaLWVFp1VSHAAutd0EIyGj4OMoQaOrneF0NVSX3krJiAITbJqXLe5ECt/lNYGoAt9Rybyej+YXQBIuEBn72/nnf90ztwvpSvMH/3MsfxF5o/WijNadedW1sY72FyVcOSmND6ZPVmgw/rEFPs1zAdfFhVX7JP9ffll0UknDyafjBdDMn7OGbiZ3DIsFJIqroxusWqEjizCrq4ds+TynGCPVQ/lp8//D6F8MmQ6R+aRn+f4yfTOj0RBeqfORZx4yM+7+bvIm7vRqJkPD7qLNL69IB32mrNe9o1T/gYHfcxMalvCUkLeWDDv5sQSUR3VMENHPlsSqaXOSC6AoVk9JYoTibLGc45B35u3an2nRXe9H8dQhNZ6MRpWhEmIEJ3oTVyCsTSfDTwm40dLormlbIJlROoyb011vm9l12kB0iROLxr96nk99vmiF8kY3QZcN2P/5SA3SqrncD3H5HTbvjzx5xvYmeb6F0EFpE/xI3/om1SiSR4O/bHOvkB15jaoIOzNmtX7PlAlYqspDgwRUyuH0nFepR/yx5JSOXmegKyiBuwz42YUmljSNrXasas6Wuz8y5egRWtvNi3HDtxURRkMCcDKIN5kUd7Zav0NT+rynTOSTN2SCmEm6At+NIP4qRCu9OXJAGw7+59ZNtDXK/IuwdWObWZo+b9wToBoypaMqyN/VKdnacmVMwzrEQK6mzqusSVDFExXBiHIdlyfiey59cQ5GLQD/lgnltTmEw6x8lj5YhnWhTUtQX8+96IShf4sDrtmtS5SA8uK+TNYjkTyvr0/7TulOe2n8Nd4JOyxp71t8k7Uwfo5bgpJR7UBgv2ZJgLU6t+zgOImh7hse1RE6ScNzhXpss0k5AMpMIqaz4wB36XHu3jPpLb1XyTv/CujPjDjUb2wOKJSerxrWjiZJekcLyy+MCaoWSUmF4kjKk6pNgDl0MkYdgeBTnCAAA==",\r
  version: "2.0.2",\r
  readme:\r
    "优云智算\\n\\n**优云智算 API Key**：图片与视频模型用，获取地址 https://console.compshare.cn/light-gpu/api-keys\\n**MiniMax API Key**：只有 \`MiniMax-H3\` 用，获取地址 https://www.compshare.cn/video-studio",\r
  rules: [\r
    {\r
      type: "input",\r
      field: "apiKey",\r
      title: "API Key",\r
      value: "",\r
      props: { type: "password", showPassword: true, autocomplete: "off" },\r
    },\r
    {\r
      type: "input",\r
      field: "minimaxApiKey",\r
      title: "MiniMax API Key",\r
      value: "",\r
      props: { type: "password", showPassword: true, autocomplete: "off" },\r
    },\r
  ],\r
  models: [\r
    {\r
      id: "MiniMax-H3",\r
      label: "MiniMax H3（文/图/参考素材生视频 · 视频工作台）",\r
      type: "video",\r
      mode: ["text", "singleImage", "endFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      imageRatios: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],\r
      durationResolutionMap: [\r
        {\r
          duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],\r
          resolution: ["480P", "768P", "1080P", "2K", "4K"],\r
        },\r
      ],\r
    },\r
    {\r
      id: "doubao-seedream-5-0-pro-260628",\r
      label: "doubao-seedream 5.0 Pro（文生图 / 多参考图）",\r
      type: "image",\r
      mode: ["text", "multiReference"],\r
      imageSizes: ["1K", "1.5K", "2K"],\r
      imageRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],\r
    },\r
    {\r
      id: "doubao-seedream-5-0-260128",\r
      label: "doubao-seedream 5.0（文生图 / 多参考图）",\r
      type: "image",\r
      mode: ["text", "multiReference"],\r
      imageSizes: ["2K", "3K", "4K"],\r
      imageRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],\r
    },\r
    {\r
      id: "qwen-image-3.0",\r
      label: "Qwen Image 3.0（文生图 / 参考图编辑）",\r
      type: "image",\r
      mode: ["text", "multiReference"],\r
      imageSizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048", "1280x720", "720x1280"],\r
      imageRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],\r
    },\r
    {\r
      id: "qwen-image-3.0-pro",\r
      label: "Qwen Image 3.0 Pro（文生图 / 参考图编辑）",\r
      type: "image",\r
      mode: ["text", "multiReference"],\r
      imageSizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048", "1280x720", "720x1280"],\r
      imageRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],\r
    },\r
    {\r
      id: "gpt-image-2",\r
      label: "gpt-image-2（文生图 / 单图编辑）",\r
      type: "image",\r
      mode: ["text", "singleImage"],\r
      imageSizes: ["1K", "2K", "4K"],\r
      imageRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "21:9"],\r
    },\r
    {\r
      id: "Qwen/Qwen-Image",\r
      label: "Qwen-Image（文生图）",\r
      type: "image",\r
      mode: ["text"],\r
      imageSizes: ["1024x1024", "1280x720", "720x1280", "1536x1536"],\r
      imageRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],\r
    },\r
    {\r
      id: "Qwen/Qwen-Image-Edit",\r
      label: "Qwen-Image-Edit（单图编辑）",\r
      type: "image",\r
      mode: ["singleImage"],\r
      imageSizes: ["1024x1024", "1280x720", "720x1280", "1536x1536"],\r
      imageRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],\r
    },\r
    {\r
      id: "doubao-seedance-2-0-260128",\r
      label: "doubao-seedance 2.0（文/图生视频 / 参考素材）",\r
      type: "video",\r
      mode: ["text", "singleImage", "startEndRequired", ["imageReference:9", "videoReference:3", "audioReference:3"]],\r
      audio: "optional",\r
      imageRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],\r
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],\r
    },\r
  ] satisfies ProviderModel[],\r
  async generateImage(this: Context, request: ImageRequest): Promise<MediaAsset[]> {\r
    this.signal?.throwIfAborted();\r
    const model = typeof request.model === "string" ? request.model.trim() : "";\r
    if (!model) {\r
      throw new Error("未指定图片模型");\r
    }\r
    const apiKey = requireModelVerseKey(this);\r
    const protocol = imageProtocolOf(model);\r
    ensureNoUnsupportedImageOptions(protocol, request);\r
    try {\r
      if (protocol === "gemini") {\r
        return await generateGeminiImage(this, request, apiKey);\r
      }\r
      if (protocol === "gpt") {\r
        return await generateGptImage(this, request, apiKey);\r
      }\r
      if (protocol === "qwen3") {\r
        return await generateQwen3Image(this, request, apiKey);\r
      }\r
      return await generateOpenAiImage(this, request, apiKey);\r
    } catch (error) {\r
      throw friendlyError(error);\r
    }\r
  },\r
  async generateVideo(this: Context, request: VideoRequest): Promise<MediaAsset[]> {\r
    this.signal?.throwIfAborted();\r
    const model = typeof request.model === "string" ? request.model.trim() : "";\r
    if (!model) {\r
      throw new Error("未指定视频模型");\r
    }\r
    if (isH3Model(model)) {\r
      const apiKey = requireH3Key(this);\r
      try {\r
        return await generateH3Video(this, request, apiKey);\r
      } catch (error) {\r
        throw friendlyError(error);\r
      }\r
    }\r
    const apiKey = requireModelVerseKey(this);\r
    const lower = model.toLowerCase();\r
    const promptOptional = lower.indexOf("lip-sync") !== -1 || lower.indexOf("extend") !== -1;\r
    const normalized: VideoRequest = Object.assign({}, request, {\r
      prompt: request.prompt && request.prompt.trim() ? request.prompt : promptOptional ? "" : "",\r
    });\r
    if (!promptOptional && !normalized.prompt.trim()) {\r
      throw new Error("请先填写视频提示词");\r
    }\r
    const protocol = videoProtocolOf(model);\r
    try {\r
      if (protocol === "hailuo") {\r
        return await runVideoTask(this, normalized, apiKey, await buildHailuoBody(this, normalized));\r
      }\r
      if (protocol === "vidu") {\r
        return await runVideoTask(this, normalized, apiKey, await buildViduBody(this, normalized));\r
      }\r
      if (protocol === "wan") {\r
        return await runVideoTask(this, normalized, apiKey, await buildWanBody(this, normalized));\r
      }\r
      return await runVideoTask(this, normalized, apiKey, await buildSeedanceBody(this, normalized));\r
    } catch (error) {\r
      throw friendlyError(error);\r
    }\r
  },\r
  async resumeTask(this: Context, data: ProviderTaskData): Promise<MediaAsset[]> {\r
    if ((data.kind !== "modelVerseVideo" && data.kind !== "h3Video") || typeof data.taskId !== "string" || !data.taskId\r
      || typeof data.model !== "string" || !data.model || typeof data.deadline !== "number" || !Number.isFinite(data.deadline)) {\r
      throw new Error("视频任务恢复数据无效");\r
    }\r
    if (data.kind === "h3Video") return waitForH3Video(this, data.taskId, requireH3Key(this));\r
    const urls = await waitForTask(this, { taskId: data.taskId, apiKey: requireModelVerseKey(this) }, VIDEO_TOTAL_TIMEOUT);\r
    return urls.map((url) => ({ mediaType: "video", type: "url", url, mimeType: "" }));\r
  },\r
};\r
`;export{t as n,e as r,n as t};