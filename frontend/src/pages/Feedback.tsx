import FeedbackForm from '../components/FeedbackForm';

export default function FeedbackPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d29922] to-[#e3b341] flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#e6edf3]">自我复盘</h2>
            <p className="text-sm text-[#8b949e] mt-0.5">记录训练心得、客户沟通反思、自我评分</p>
          </div>
        </div>
      </div>

      <FeedbackForm />
    </div>
  );
}
