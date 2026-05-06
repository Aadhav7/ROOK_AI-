from src.brain import SyllabusBrain

def main():
    try:
        # Load the data from your data/ folder
        brain = SyllabusBrain()
        
        print("\n" + "="*40)
        print("   ROOK AI: SLIATE SYLLABUS ASSISTANT")
        print("      Type 'exit' to end the chat")
        print("="*40 + "\n")

        # This loop keeps the AI interactive
        while True:
            user_input = input("Student: ")
            
            if user_input.lower() in ["exit", "quit", "bye"]:
                print("Goodbye! Good luck with your HNDIT studies.")
                break
                
            if not user_input.strip():
                continue

            # This calls the brain.py logic to get an answer from Gemini
            response = brain.query(user_input)
            print(f"\nAI: {response}\n")
            print("-" * 20)

    except Exception as e:
        print(f"Startup Error: {e}")

if __name__ == "__main__":
    main()
