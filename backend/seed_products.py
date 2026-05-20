"""Seed 25 financial products across all types and risk levels."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta
import random
from app.database import SessionLocal
from app.models.product import Product

random.seed(42)

PRODUCTS = [
    # ---- 保险 (R1-R2, low return, long lock) ----
    {"name": "平安福终身寿险", "type": "保险", "risk_level": 1, "expected_return": 2.8, "min_investment": 5000, "issuer": "中国平安", "target_tags": ["保守", "长期保障", "家庭"], "lock_period": "终身", "description": "保障终身，涵盖身故及重大疾病，适合家庭支柱配置基础保障。"},
    {"name": "太平洋金佑人生年金险", "type": "保险", "risk_level": 1, "expected_return": 3.2, "min_investment": 10000, "issuer": "太平洋保险", "target_tags": ["保守", "养老", "年金"], "lock_period": "10年", "description": "十年期缴费，退休后按月领取年金，稳定养老收入来源。"},
    {"name": "泰康健康尊享医疗险", "type": "保险", "risk_level": 1, "expected_return": 2.5, "min_investment": 2000, "issuer": "泰康保险", "target_tags": ["保守", "医疗", "健康"], "lock_period": "1年续保", "description": "百万医疗保额，覆盖住院及门诊，年度续保型消费险。"},
    {"name": "新华人寿分红型两全险", "type": "保险", "risk_level": 2, "expected_return": 4.0, "min_investment": 20000, "issuer": "新华人寿", "target_tags": ["稳健", "分红", "储蓄"], "lock_period": "5年", "description": "五年期满返还本金加分红，兼具保障和储蓄功能。"},

    # ---- 基金 (R2-R4, mixed returns) ----
    {"name": "易方达蓝筹精选混合", "type": "基金", "risk_level": 3, "expected_return": 12.5, "min_investment": 1000, "issuer": "易方达基金", "target_tags": ["进取", "混合型", "大盘蓝筹"], "lock_period": "T+1", "description": "专注A股蓝筹龙头，长期持有享受企业成长红利。"},
    {"name": "天弘沪深300指数增强", "type": "基金", "risk_level": 2, "expected_return": 8.5, "min_investment": 100, "issuer": "天弘基金", "target_tags": ["稳健", "指数", "定投"], "lock_period": "T+1", "description": "跟踪沪深300指数并进行增强操作，适合定投长期持有。"},
    {"name": "中欧医疗健康混合A", "type": "基金", "risk_level": 4, "expected_return": 15.0, "min_investment": 1000, "issuer": "中欧基金", "target_tags": ["进取", "行业主题", "医疗"], "lock_period": "T+2", "description": "聚焦医疗健康赛道，精选创新药、器械及服务龙头。"},
    {"name": "南方现金增利货币A", "type": "基金", "risk_level": 1, "expected_return": 2.2, "min_investment": 1, "issuer": "南方基金", "target_tags": ["保守", "货币", "流动性"], "lock_period": "T+0", "description": "高流动性货币基金，赎回即时到账，适合闲置资金管理。"},
    {"name": "招商中证白酒指数", "type": "基金", "risk_level": 4, "expected_return": 18.0, "min_investment": 100, "issuer": "招商基金", "target_tags": ["进取", "行业主题", "消费"], "lock_period": "T+1", "description": "跟踪中证白酒指数，高波动高收益，适合风险承受力强的客户。"},
    {"name": "华夏科创50ETF联接", "type": "基金", "risk_level": 4, "expected_return": 16.0, "min_investment": 1000, "issuer": "华夏基金", "target_tags": ["进取", "科技", "ETF"], "lock_period": "T+1", "description": "投资科创板50核心成分股，聚焦半导体、AI等硬科技赛道。"},
    {"name": "广发稳健增长混合", "type": "基金", "risk_level": 2, "expected_return": 7.0, "min_investment": 500, "issuer": "广发基金", "target_tags": ["稳健", "混合型", "平衡"], "lock_period": "T+1", "description": "股债均衡配置，回撤控制优秀，追求长期稳健增值。"},

    # ---- 理财 (R2-R3, stable) ----
    {"name": "招银理财招睿日开", "type": "理财", "risk_level": 2, "expected_return": 3.8, "min_investment": 10000, "issuer": "招商银行", "target_tags": ["稳健", "日开型", "流动性"], "lock_period": "T+1", "description": "每日开放申赎的净值型理财，底层为短久期债券组合。"},
    {"name": "工银理财鑫添益", "type": "理财", "risk_level": 2, "expected_return": 4.2, "min_investment": 50000, "issuer": "工商银行", "target_tags": ["稳健", "固收+", "中期"], "lock_period": "6个月", "description": "固收+策略理财，80%债券打底+20%权益增强，半年封闭期。"},
    {"name": "兴银理财稳利恒盈", "type": "理财", "risk_level": 3, "expected_return": 5.5, "min_investment": 100000, "issuer": "兴业银行", "target_tags": ["均衡", "多资产", "中长期"], "lock_period": "1年", "description": "多资产配置策略，涵盖债、股、商品、另类，一年封闭运作。"},
    {"name": "中信理财慧赢", "type": "理财", "risk_level": 2, "expected_return": 3.5, "min_investment": 10000, "issuer": "中信银行", "target_tags": ["保守", "货币增强", "短期"], "lock_period": "30天", "description": "三十天滚动持有，收益略高于货币基金，适合短期闲置资金。"},

    # ---- 信托 (R3-R5, high min investment) ----
    {"name": "中信信托基础设施1号", "type": "信托", "risk_level": 3, "expected_return": 7.5, "min_investment": 1000000, "issuer": "中信信托", "target_tags": ["均衡", "基础设施", "高净值"], "lock_period": "2年", "description": "投资于高速公路、物流园区等基础设施项目，现金流稳定。"},
    {"name": "平安信托房地产优选", "type": "信托", "risk_level": 4, "expected_return": 9.0, "min_investment": 3000000, "issuer": "平安信托", "target_tags": ["进取", "房地产", "高净值"], "lock_period": "3年", "description": "精选一二线城市核心地段商业地产项目，租金+增值双重收益。"},
    {"name": "华润信托碳中和产业", "type": "信托", "risk_level": 4, "expected_return": 10.0, "min_investment": 2000000, "issuer": "华润信托", "target_tags": ["进取", "新能源", "ESG"], "lock_period": "3年", "description": "投资光伏、风电、储能等碳中和产业链优质标的。"},

    # ---- 结构化 (R3-R5, mixed features) ----
    {"name": "中信证券鲨鱼鳍结构收益凭证", "type": "结构化", "risk_level": 4, "expected_return": 8.0, "min_investment": 100000, "issuer": "中信证券", "target_tags": ["进取", "结构化", "保本浮动"], "lock_period": "6个月", "description": "挂钩中证500指数，上涨参与率150%，保本+浮动收益结构。"},
    {"name": "华泰证券雪球结构产品", "type": "结构化", "risk_level": 5, "expected_return": 12.0, "min_investment": 500000, "issuer": "华泰证券", "target_tags": ["激进", "雪球", "高票息"], "lock_period": "2年", "description": "经典雪球结构，每月观察敲出，年化票息12%，适合震荡市。"},
    {"name": "国泰君安凤凰结构收益凭证", "type": "结构化", "risk_level": 3, "expected_return": 5.5, "min_investment": 100000, "issuer": "国泰君安", "target_tags": ["均衡", "结构化", "下行保护"], "lock_period": "1年", "description": "20%安全垫保护，挂钩沪深300，适合温和看涨的客户。"},

    # ---- 其他 ----
    {"name": "蚂蚁集团余额宝", "type": "其他", "risk_level": 1, "expected_return": 2.0, "min_investment": 1, "issuer": "蚂蚁集团", "target_tags": ["保守", "货币", "互联网"], "lock_period": "T+0", "description": "互联网货币基金，随存随取，适合日常零钱管理。"},
    {"name": "微众银行大额存单", "type": "其他", "risk_level": 1, "expected_return": 3.0, "min_investment": 200000, "issuer": "微众银行", "target_tags": ["保守", "存款", "互联网"], "lock_period": "3年", "description": "银行存款保险保障，三年期大额存单，利率锁定。"},
    {"name": "黄金ETF联接A", "type": "其他", "risk_level": 3, "expected_return": 6.0, "min_investment": 100, "issuer": "华安基金", "target_tags": ["均衡", "黄金", "避险"], "lock_period": "T+1", "description": "跟踪上海黄金交易所Au99.99现货价格，对冲通胀和汇率风险。"},
]


def _generate_nav_history(expected_return: float) -> list[dict]:
    nav = 1.0
    history = []
    base_date = datetime.utcnow().replace(day=1) - timedelta(days=365)
    monthly_return = expected_return / 100 / 12
    for i in range(12):
        noise = random.uniform(-0.04, 0.04)
        nav *= (1 + monthly_return + noise)
        month_date = base_date + timedelta(days=32 * i)
        history.append({
            "date": month_date.replace(day=1).strftime("%Y-%m-%d"),
            "nav": round(nav, 4),
            "return_rate": round((nav - 1.0) * 100, 2),
        })
    return history


def main():
    db = SessionLocal()
    try:
        existing = db.query(Product).count()
        if existing > 0:
            print(f"Database already has {existing} products. Skipping seed.")
            return

        for p_data in PRODUCTS:
            product = Product(
                name=p_data["name"],
                type=p_data["type"],
                risk_level=p_data["risk_level"],
                expected_return=p_data["expected_return"],
                min_investment=p_data["min_investment"],
                description=p_data.get("description"),
                issuer=p_data.get("issuer"),
                target_tags=p_data.get("target_tags"),
                lock_period=p_data.get("lock_period"),
                nav_history=_generate_nav_history(p_data["expected_return"]),
                source="simulated",
            )
            db.add(product)

        db.commit()
        print(f"Seeded {len(PRODUCTS)} products successfully.")

        # Verify
        count = db.query(Product).count()
        types = db.query(Product.type).distinct().all()
        print(f"Total products in DB: {count}")
        print(f"Product types: {[t[0] for t in types]}")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
