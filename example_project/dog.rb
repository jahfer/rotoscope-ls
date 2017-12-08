require 'rotoscope'

class Dog
  def bark
    Noisemaker.speak('woof!')
  end
end

class Noisemaker
  def self.speak(str)
    puts(str)
  end
end

log_file = File.expand_path('.rotoscope')
puts "Writing to #{log_file}..."

Rotoscope.trace(log_file, flatten: true) do
  dog1 = Dog.new
  dog1.bark
end
