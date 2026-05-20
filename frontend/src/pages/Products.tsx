import ProductManager from '../components/ProductManager';

export default function Products() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#e6edf3]">产品库</h2>
        <p className="text-sm text-[#8b949e] mt-0.5">管理金融产品，基金自动拉取实时净值</p>
      </div>
      <ProductManager />
    </div>
  );
}
