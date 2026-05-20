import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCategories, getCustomers } from '../services/api';

export default function Dashboard() {
  const [docCount, setDocCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);

  useEffect(() => {
    getCategories().then(cats => {
      setDocCount(cats.reduce((s, c) => s + c.document_count, 0));
    }).catch(() => {});
    getCustomers().then(res => setCustomerCount(res.total)).catch(() => {});
  }, []);

  const cards = [
    { title: '知识库', desc: '浏览、搜索和上传销售辅助文档', count: `${docCount} 篇文档`, to: '/knowledge', color: 'blue' },
    { title: '客户分析', desc: '导入客户信息，AI 生成画像与分析', count: `${customerCount} 位客户`, to: '/customers', color: 'green' },
  ];

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-white mb-6">销售辅助平台</h2>
      <div className="grid grid-cols-2 gap-6 max-w-2xl">
        {cards.map(card => (
          <Link key={card.to} to={card.to}
            className={`bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-${card.color}-600 transition-colors group`}>
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">{card.title}</h3>
            <p className="text-sm text-gray-500 mt-2">{card.desc}</p>
            <p className="text-xs text-gray-600 mt-3">{card.count}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
