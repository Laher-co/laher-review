import ReviewPage from '@/components/ReviewPage'

interface PageProps {
  searchParams: {
    email?: string
    designer?: string
    imageUrl?: string
    cardId?: string
  }
}

export default function Page({ searchParams }: PageProps) {
  const { email, designer, imageUrl, cardId } = searchParams

  if (!email || !designer || !imageUrl) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col">
        <header className="bg-black px-8 py-5">
          <h1 className="font-inter text-white text-xl font-semibold tracking-[0.3em] uppercase">
            Laher
          </h1>
        </header>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <p className="text-gray-400 text-sm" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
              This review link is incomplete. Please use the link provided in your email.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ReviewPage
      customerEmail={email}
      designerName={designer}
      imageUrl={imageUrl}
      cardId={cardId ?? ''}
    />
  )
}
