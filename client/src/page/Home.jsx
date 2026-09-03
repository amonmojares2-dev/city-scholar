import Navbar from "./Navbar";
import Hero from "./Hero";
import Stats from "./Stats";
import ScholarshipProgram from "./ScholarshipProgram";
import HowToApply from "./HowToApply";
import ScholarStories from "./ScholarStories";
import Announcements from "./Announcements";
import Footer from "./Footer";

export default function Home() {
  return (
    <div className="homepage">

      <Navbar />

      <main>

        <Hero />

        <Stats />

        <ScholarshipProgram />

        <HowToApply />

        <ScholarStories />

        <Announcements />

      </main>

      <Footer />

    </div>
  );
}