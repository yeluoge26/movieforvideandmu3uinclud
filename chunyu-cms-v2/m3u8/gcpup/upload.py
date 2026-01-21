import os
import csv
import json
import time
from datetime import datetime
from google.cloud import storage

# ========= 配置区 =========
BUCKET_NAME = "qinshortvide"
LOCAL_OUTPUT_DIR = r"F:\youtubeup\gcpup\output"
GCS_BASE_DIR = "hls"  # GCS中的基础目录
SERVICE_ACCOUNT_KEY = r"F:\youtubeup\gcpup\gcs-upload-sa.json"
# GCS公共URL前缀（如果需要公开访问）
GCS_PUBLIC_URL_PREFIX = f"https://storage.googleapis.com/{BUCKET_NAME}"
# =========================

LOG_FILE = f"upload_log_{datetime.now().strftime('%Y-%m-%d')}.csv"
ASSET_SUMMARY_FILE = f"asset_summary_{datetime.now().strftime('%Y-%m-%d')}.json"


def init_gcs_client():
    """初始化GCS客户端"""
    return storage.Client.from_service_account_json(
        SERVICE_ACCOUNT_KEY
    )


def init_log():
    """初始化日志文件"""
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "asset_id",
                "file_type",
                "filename",
                "status",
                "local_path",
                "gcs_path",
                "gcs_url",
                "size_mb",
                "uploaded_at",
                "error_message"
            ])


def log_row(asset_id, file_type, filename, status, local_path, gcs_path, 
            gcs_url, size_mb, uploaded_at="", error_message=""):
    """记录日志行"""
    with open(LOG_FILE, mode="a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            asset_id,
            file_type,
            filename,
            status,
            local_path,
            gcs_path,
            gcs_url,
            size_mb,
            uploaded_at,
            error_message
        ])


def save_asset_summary(asset_summaries):
    """保存资产汇总信息到JSON文件，方便API调用"""
    with open(ASSET_SUMMARY_FILE, mode="w", encoding="utf-8") as f:
        json.dump(asset_summaries, f, ensure_ascii=False, indent=2)


def get_file_type(filename):
    """根据文件名判断文件类型"""
    if filename.endswith('.m3u8'):
        return 'playlist'
    elif filename.endswith('.ts'):
        return 'segment'
    elif filename.endswith('.jpg') or filename.endswith('.png'):
        return 'cover'
    elif filename.endswith('.json'):
        return 'metadata'
    elif filename.endswith('.txt'):
        return 'text'
    elif filename.endswith('.key'):
        return 'key'
    else:
        return 'other'


def upload_file(client, bucket, asset_id, local_path, gcs_path):
    """上传单个文件到GCS"""
    blob = bucket.blob(gcs_path)
    
    # 检查文件是否已存在
    if blob.exists():
        return "SKIPPED", None
    
    try:
        blob.upload_from_filename(local_path, timeout=600)
        gcs_url = f"{GCS_PUBLIC_URL_PREFIX}/{gcs_path}"
        return "SUCCESS", gcs_url
    except Exception as e:
        return "FAILED", str(e)


def upload_asset_directory(client, bucket, asset_dir_path, asset_id):
    """上传单个资产目录的所有文件"""
    asset_summary = {
        "asset_id": asset_id,
        "uploaded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "files": {
            "playlist": None,
            "segments": [],
            "cover": None,
            "metadata": None,
            "other": []
        },
        "total_size_mb": 0,
        "file_count": 0
    }
    
    files = os.listdir(asset_dir_path)
    total_files = len(files)
    uploaded_count = 0
    skipped_count = 0
    failed_count = 0
    
    print(f"\n📁 处理资产目录: {asset_id}")
    print(f"   文件总数: {total_files}")
    
    # 先上传m3u8文件，然后是其他文件
    sorted_files = sorted(files, key=lambda x: (
        0 if x.endswith('.m3u8') else 1,
        x
    ))
    
    for filename in sorted_files:
        local_path = os.path.join(asset_dir_path, filename)
        
        # 跳过目录
        if os.path.isdir(local_path):
            continue
        
        file_type = get_file_type(filename)
        size_mb = round(os.path.getsize(local_path) / 1024 / 1024, 2)
        gcs_path = f"{GCS_BASE_DIR}/{asset_id}/{filename}"
        
        # 上传文件
        status, result = upload_file(client, bucket, asset_id, local_path, gcs_path)
        
        if status == "SUCCESS":
            gcs_url = result
            uploaded_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            uploaded_count += 1
            asset_summary["total_size_mb"] += size_mb
            asset_summary["file_count"] += 1
            
            # 记录到汇总信息
            if file_type == 'playlist':
                asset_summary["files"]["playlist"] = {
                    "filename": filename,
                    "gcs_path": gcs_path,
                    "gcs_url": gcs_url,
                    "size_mb": size_mb
                }
            elif file_type == 'segment':
                asset_summary["files"]["segments"].append({
                    "filename": filename,
                    "gcs_path": gcs_path,
                    "gcs_url": gcs_url,
                    "size_mb": size_mb
                })
            elif file_type == 'cover':
                asset_summary["files"]["cover"] = {
                    "filename": filename,
                    "gcs_path": gcs_path,
                    "gcs_url": gcs_url,
                    "size_mb": size_mb
                }
            elif file_type == 'metadata':
                asset_summary["files"]["metadata"] = {
                    "filename": filename,
                    "gcs_path": gcs_path,
                    "gcs_url": gcs_url,
                    "size_mb": size_mb
                }
            else:
                asset_summary["files"]["other"].append({
                    "filename": filename,
                    "file_type": file_type,
                    "gcs_path": gcs_path,
                    "gcs_url": gcs_url,
                    "size_mb": size_mb
                })
            
            print(f"   ✅ [{uploaded_count}/{total_files}] {filename} ({size_mb} MB)")
            
        elif status == "SKIPPED":
            skipped_count += 1
            gcs_url = f"{GCS_PUBLIC_URL_PREFIX}/{gcs_path}"
            print(f"   ⏭  [{skipped_count} 跳过] {filename}")
        else:
            failed_count += 1
            error_message = result
            gcs_url = ""
            print(f"   ❌ [{failed_count} 失败] {filename}: {error_message}")
            time.sleep(2)  # 失败后等待
        
        # 记录日志
        log_row(
            asset_id=asset_id,
            file_type=file_type,
            filename=filename,
            status=status,
            local_path=local_path,
            gcs_path=gcs_path,
            gcs_url=gcs_url if status != "FAILED" else "",
            size_mb=size_mb,
            uploaded_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S") if status == "SUCCESS" else "",
            error_message=result if status == "FAILED" else ""
        )
    
    # 排序segments列表
    asset_summary["files"]["segments"].sort(key=lambda x: x["filename"])
    
    print(f"   📊 完成: 成功={uploaded_count}, 跳过={skipped_count}, 失败={failed_count}")
    
    return asset_summary


def upload_all_assets():
    """上传所有资产目录"""
    client = init_gcs_client()
    bucket = client.bucket(BUCKET_NAME)
    init_log()
    
    asset_summaries = {}
    
    # 获取所有子目录
    subdirs = [d for d in os.listdir(LOCAL_OUTPUT_DIR) 
               if os.path.isdir(os.path.join(LOCAL_OUTPUT_DIR, d))]
    
    total_assets = len(subdirs)
    print(f"\n🚀 开始上传任务")
    print(f"   资产目录总数: {total_assets}")
    print(f"   日志文件: {LOG_FILE}")
    print(f"   汇总文件: {ASSET_SUMMARY_FILE}")
    print("=" * 60)
    
    for idx, asset_id in enumerate(subdirs, 1):
        asset_dir_path = os.path.join(LOCAL_OUTPUT_DIR, asset_id)
        
        print(f"\n[{idx}/{total_assets}] ", end="")
        asset_summary = upload_asset_directory(client, bucket, asset_dir_path, asset_id)
        asset_summaries[asset_id] = asset_summary
        
        # 每处理10个资产保存一次汇总（防止数据丢失）
        if idx % 10 == 0:
            save_asset_summary(asset_summaries)
            print(f"\n💾 已保存进度到 {ASSET_SUMMARY_FILE}")
    
    # 最终保存汇总
    save_asset_summary(asset_summaries)
    
    print("\n" + "=" * 60)
    print(f"✅ 所有任务完成！")
    print(f"   处理资产数: {total_assets}")
    print(f"   详细日志: {LOG_FILE}")
    print(f"   资产汇总: {ASSET_SUMMARY_FILE}")
    print(f"   汇总文件包含所有资产的GCS路径和URL，可直接用于API调用")


if __name__ == "__main__":
    upload_all_assets()
