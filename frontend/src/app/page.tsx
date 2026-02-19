export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-3xl font-bold mb-2">Poker Tracker</h1>
      <p className="text-gray-400 text-center">
        Track buy-ins, chip counts, and settle up with friends.
      </p>
      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        <button className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl w-full">
          Sign In
        </button>
        <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 px-6 rounded-xl w-full">
          Try Demo
        </button>
      </div>
    </main>
  );
}